// The natural-language layer's client half — NLLC's reason for being, and
// the one piece that stays in the app rather than the engine.
//
// Replaces the old `ollama.js` stub. The name changed because the layer no
// longer is one: a model is addressed as "<provider>:<model>", and Ollama is
// only the local one. Everything provider-specific lives server-side in
// $lib/server/llm/; this file owns conversation state, the request queue, and
// the `/llm` command surface.
//
// Three things are built in from the start because retrofitting them later
// would mean rewriting this file:
//   - a **system prompt**, assembled server-side from the editable markdown
//     in `static/context/` (see $lib/server/llm/context.js) — not sent from
//     here, so it stays byte-stable and cacheable across turns
//   - **structured output**, via the `format` field (a JSON schema) that both
//     providers accept — unused by `/llm`, waiting for the command layer
//   - **memory**, as a trimmed `history` array plus a provider-side
//     `conversationId` for backends that own their own transcript
//
// Requests **queue** rather than being rejected. A queued question is still a
// question you meant to ask, and dropping it mid-performance is worse than
// answering it a few seconds late. Engine commands never queue — they're
// dispatched before this is ever consulted (see SessionPage.svelte).

import { buildUserTurn, describeSession } from "./llm-context.js";

export const LLM_MODEL_KEY = "nllc:llmModel";

// Turns kept and resent. Each turn is a question and its answer, so eight is
// four exchanges — enough for "what does that do?" follow-ups without
// growing the prompt without bound in a session that runs for hours.
const MAX_HISTORY_TURNS = 8;
const MAX_QUEUED = 4;

// Recognizes the console's `/llm` line and hands back what the user actually
// wrote. Parsed here rather than by the engine's router because that router
// splits a line at every "/word" it finds and tokenizes `key=value` pairs — both
// of which would mangle a sentence. Returns null for anything that isn't
// `/llm`, which is the signal to fall through to the engine.
export function parseLlmCommand(text) {
    const trimmed = text.trim();
    if (trimmed !== "/llm" && !trimmed.startsWith("/llm ")) return null;

    let rest = trimmed.slice("/llm".length).trim();

    // Sub-commands are dash-prefixed so they can't collide with a question.
    // "/llm reset the reverb" is a thing someone might genuinely ask; "/llm
    // --reset" is not.
    for (const name of ["status", "reset", "stop", "bare", "context"]) {
        if (rest === `--${name}`) return { action: name, question: "" };
        if (rest.startsWith(`--${name} `)) return { action: name, question: rest.slice(name.length + 3).trim() };
    }

    // `/llm "how do I ..."` — strip the quotes the user reasonably assumed
    // were required, but only when they wrap the whole thing.
    if (rest.length >= 2 && ((rest.startsWith('"') && rest.endsWith('"')) || (rest.startsWith("'") && rest.endsWith("'")))) {
        rest = rest.slice(1, -1);
    }

    return { action: rest ? "ask" : "status", question: rest };
};

export class LlmSession {
    // `getModel` is read per turn rather than captured, so changing the
    // homepage selection takes effect without rebuilding this.
    constructor({ engine, getModel }) {
        this.engine = engine;
        this.getModel = getModel;

        this.history = [];
        this.conversationId = null;
        this.startedWithModel = null;

        this.queue = [];
        this.current = null;
        this.controller = null;
    };

    get busy() {
        return this.current !== null;
    };

    status() {
        const model = this.getModel();
        if (!model) return "no model selected — pick one on the homepage";

        const turns = this.history.length / 2;
        const parts = [
            model,
            turns ? `${turns} turn${turns === 1 ? "" : "s"} remembered` : "no history",
        ];
        if (this.busy) parts.push("working");
        if (this.queue.length) parts.push(`${this.queue.length} queued`);
        return `llm: ${parts.join(" · ")}`;
    };

    reset() {
        this.history = [];
        this.conversationId = null;
        this.startedWithModel = null;
        return "llm: conversation cleared";
    };

    // Aborts whatever is running and drops the queue. Every waiting caller is
    // rejected rather than left hanging — each one owns a console line that
    // has to resolve to something.
    stop() {
        const dropped = this.queue.length;
        for (const job of this.queue) job.reject(new Error("cancelled"));
        this.queue = [];

        const wasBusy = this.busy;
        this.controller?.abort();

        if (!wasBusy && !dropped) return "llm: nothing running";
        return `llm: stopped${dropped ? `, dropped ${dropped} queued` : ""}`;
    };

    // Asks a question. Resolves with { text, meta }; rejects on failure or
    // cancellation. `handlers` receives progress: onQueued(position),
    // onStart({provider, model}), onReasoning(text), onDelta(text).
    ask(question, handlers = {}, { withContext = true } = {}) {
        return new Promise((resolve, reject) => {
            if (this.queue.length >= MAX_QUEUED) {
                reject(new Error(`queue full (${MAX_QUEUED}) — /llm --stop to clear it`));
                return;
            }

            this.queue.push({ question, handlers, withContext, resolve, reject });
            const position = this.queue.length - (this.busy ? 0 : 1);
            if (position > 0) handlers.onQueued?.(position);

            this.#pump();
        });
    };

    async #pump() {
        if (this.current) return;

        const job = this.queue.shift();
        if (!job) return;

        this.current = job;
        try {
            job.resolve(await this.#run(job));
        } catch (error) {
            job.reject(error);
        } finally {
            this.current = null;
            this.controller = null;
            // Everyone still waiting moved up one; tell them, so a queued
            // line's "3rd in queue" doesn't sit there stale until it runs.
            this.queue.forEach((queued, index) => queued.handlers.onQueued?.(index + 1));
            this.#pump();
        }
    };

    async #run(job) {
        const model = this.getModel();
        if (!model) throw new Error("no model selected — pick one on the homepage");

        // Switching model mid-conversation drops the transcript. The
        // alternative is worse: a provider-side conversationId belongs to the
        // provider that issued it, and silently carrying half the history
        // across a switch produces a model confidently answering about a
        // conversation it never had.
        if (this.startedWithModel && this.startedWithModel !== model) {
            this.history = [];
            this.conversationId = null;
        }
        this.startedWithModel = model;

        this.controller = new AbortController();

        const sessionText = job.withContext ? describeSession(this.engine) : "";
        const body = {
            model,
            prompt: buildUserTurn(job.question, sessionText),
            history: this.history,
            conversationId: this.conversationId,
            format: null,
        };

        const response = await fetch("/api/llm/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: this.controller.signal,
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(detail.trim() || `llm request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        let meta = {};

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.trim()) continue;

                let event;
                try {
                    event = JSON.parse(line);
                } catch {
                    continue;
                }

                if (event.type === "error") throw new Error(event.message);
                if (event.type === "start") job.handlers.onStart?.(event);
                if (event.type === "reasoning") job.handlers.onReasoning?.(event.text);
                if (event.type === "delta") {
                    text += event.text;
                    job.handlers.onDelta?.(event.text);
                }
                if (event.type === "done") {
                    meta = event.meta ?? {};
                    if (event.conversationId) this.conversationId = event.conversationId;
                }
            }
        }

        if (!text.trim()) throw new Error("model returned an empty response");

        // The bare question goes into history, not the context-prefixed
        // version — otherwise every stale session snapshot is resent forever
        // and the transcript is mostly obsolete state.
        this.history.push({ role: "user", content: job.question });
        this.history.push({ role: "assistant", content: text });
        if (this.history.length > MAX_HISTORY_TURNS * 2) {
            this.history = this.history.slice(-MAX_HISTORY_TURNS * 2);
        }

        return { text, meta };
    };
};

function kb(bytes) {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
};

// What `/llm --context` prints: the whole prompt budget in one view.
//
// Both halves, because they're spent together and the tradeoff between them
// is the thing worth seeing — the static context folder is a fixed cost on
// every question, while the session block grows with the size of the music
// session. Token figures are bytes/4, the usual rough heuristic; the real
// count depends on the model's tokenizer.
export async function describeContext(engine) {
    const response = await fetch("/api/llm/context");
    if (!response.ok) throw new Error(`couldn't read the context folder (${response.status})`);

    const info = await response.json();
    const lines = [`context: ${info.files.length} file(s), ${kb(info.totalBytes)} ≈ ${info.approxTokens} tok — ${info.dir}`];

    for (const file of info.files) {
        lines.push(`  ${file.name.padEnd(24)} ${kb(file.bytes).padStart(8)} ≈ ${file.approxTokens} tok`);
    }
    if (info.files.length === 0) lines.push("  (empty — drop .md files in there and they're injected on the next question)");

    const sessionBytes = new TextEncoder().encode(describeSession(engine)).length;
    lines.push(`  ${"<session-state> (live)".padEnd(24)} ${kb(sessionBytes).padStart(8)} ≈ ${Math.round(sessionBytes / 4)} tok`);
    lines.push(`  ${"total per question".padEnd(24)} ${kb(info.totalBytes + sessionBytes).padStart(8)} ≈ ${Math.round((info.totalBytes + sessionBytes) / 4)} tok`);

    return lines.join("\n");
};

// One-line summary of a finished turn, for the console's dim status suffix.
export function formatMeta(meta) {
    const parts = [];
    if (meta.model) parts.push(meta.model);
    if (meta.durationMs) parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
    if (meta.responseTokens) parts.push(`${meta.responseTokens} tok`);
    if (typeof meta.costUsd === "number" && meta.costUsd > 0) parts.push(`$${meta.costUsd.toFixed(4)}`);
    return parts.join(" · ");
};
