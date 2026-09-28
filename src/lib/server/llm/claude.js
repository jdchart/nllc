// The Claude provider: the `claude` CLI, driven headlessly.
//
// This is what makes "use my Claude Code account" work. The CLI resolves
// credentials the same way it does interactively, so with no ANTHROPIC_API_KEY
// in the environment it authenticates as the logged-in subscription — the
// init event it emits reports `apiKeySource: "none"` to confirm it. There is
// no API key to store anywhere in this app.
//
// The cost of that is a process spawn per turn, which is why this can only
// live server-side, and why it's slower off the mark than Ollama on the same
// machine. Pick per-question from the homepage dropdown.
//
// Three flags carry the requirements the console needs and are worth naming:
//   --system-prompt   replaces Claude Code's coding-agent preamble outright,
//                     so the model is the ribbit assistant and nothing else.
//   --json-schema     structured output, for when the NL layer starts
//                     emitting commands rather than prose.
//   --resume          conversation memory, held by the CLI rather than by us
//                     (see `conversationId` below).

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const CLAUDE_BIN = process.env.NLLC_CLAUDE_BIN || "claude";

export const id = "claude";
export const label = "Claude Code (subscription)";

// The CLI takes aliases and resolves each to the current model behind it, so
// this list doesn't go stale the way pinned model IDs would.
const MODELS = [
    { id: "sonnet", label: "sonnet", detail: "balanced" },
    { id: "opus", label: "opus", detail: "most capable" },
    { id: "haiku", label: "haiku", detail: "fastest" },
];

let availability = null;

// Whether the CLI is installed and runnable. Cached after the first check —
// a binary doesn't appear and disappear mid-session, and this is on the path
// of every homepage load.
function isAvailable() {
    if (availability) return availability;

    availability = new Promise((resolve) => {
        const child = spawn(CLAUDE_BIN, ["--version"], { stdio: "ignore" });
        const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
        child.on("error", () => { clearTimeout(timer); resolve(false); });
        child.on("close", (code) => { clearTimeout(timer); resolve(code === 0); });
    });
    return availability;
};

export async function listModels() {
    if (!await isAvailable()) {
        throw new Error(`\`${CLAUDE_BIN}\` not found on PATH — install Claude Code, or unset NLLC_CLAUDE_BIN`);
    }
    return MODELS;
};

// Node streams are async-iterable but arrive in arbitrary chunks, so the tail
// of a partial line has to be carried across reads — same reason ollama.js
// buffers. Shared by stdout parsing below.
async function* lines(readable) {
    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of readable) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) if (part.trim()) yield part;
    }
    if (buffer.trim()) yield buffer;
};

export async function* chat({ model, system, prompt, format = null, conversationId = null, signal }) {
    if (!await isAvailable()) {
        throw new Error(`\`${CLAUDE_BIN}\` not found on PATH — install Claude Code, or unset NLLC_CLAUDE_BIN`);
    }

    const args = [
        "-p",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--model", model,
        // No filesystem, no bash, no web. This is a console assistant for one
        // audio session; every built-in tool is a liability and none of them
        // is any use here.
        "--tools", "",
        "--disable-slash-commands",
    ];
    if (system) args.push("--system-prompt", system);
    if (format) args.push("--json-schema", JSON.stringify(format));
    // Memory is the CLI's own session store rather than a history array we
    // resend (the way ollama.js does), because `claude -p` takes one prompt
    // rather than a message list. The first turn has no id; the init event
    // below reports the one it created, and the client hands it back next
    // turn. Costs nothing and gets prompt caching for free.
    if (conversationId) args.push("--resume", conversationId);

    // A scratch cwd, so the CLI doesn't discover this repo's CLAUDE.md and
    // start behaving like it's here to work on ribbit's source.
    const child = spawn(CLAUDE_BIN, args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });

    // The user turn goes over stdin rather than argv: it carries the session
    // state block (see llm-context.js), which grows with the size of the
    // music session and has no business near an argv length limit.
    child.stdin.end(prompt);

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });

    let text = "";
    let newConversationId = conversationId;
    let meta = {};
    let failure = null;

    try {
        for await (const line of lines(child.stdout)) {
            let event;
            try {
                event = JSON.parse(line);
            } catch {
                continue;
            }

            if (event.type === "system" && event.subtype === "init") {
                newConversationId = event.session_id ?? newConversationId;
                continue;
            }

            if (event.type === "stream_event") {
                const delta = event.event?.delta;
                if (delta?.type === "text_delta" && delta.text) {
                    text += delta.text;
                    yield { type: "delta", text: delta.text };
                } else if (delta?.type === "thinking_delta" && delta.thinking) {
                    yield { type: "reasoning", text: delta.thinking };
                }
                continue;
            }

            if (event.type === "result") {
                newConversationId = event.session_id ?? newConversationId;
                if (event.is_error) {
                    failure = event.result || event.api_error_status || "claude reported an error";
                } else if (!text && typeof event.result === "string") {
                    // No partial-message deltas arrived (short answers can
                    // land in one piece). The result field is the whole reply.
                    text = event.result;
                    yield { type: "delta", text };
                }
                meta = {
                    model: event.modelUsage ? Object.keys(event.modelUsage).at(-1) : model,
                    promptTokens: event.usage?.input_tokens,
                    responseTokens: event.usage?.output_tokens,
                    durationMs: event.duration_api_ms,
                    costUsd: event.total_cost_usd,
                };
            }
        }

        const code = await new Promise((resolve) => child.on("close", resolve));
        if (failure) throw new Error(failure);
        if (code !== 0) throw new Error(stderr.trim() || `claude exited with code ${code}`);
    } finally {
        signal?.removeEventListener("abort", onAbort);
        if (child.exitCode === null) child.kill("SIGTERM");
    }

    yield { type: "done", text, meta, conversationId: newConversationId };
};
