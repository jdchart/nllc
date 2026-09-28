// The Ollama provider: a local model server, spoken to over plain HTTP.
//
// This runs server-side rather than from the browser for two reasons. The
// obvious one is that the `claude` provider next door *can't* run in a
// browser (it spawns a process), and one shape for both keeps the client from
// branching on provider. The quieter one is CORS: Ollama's default
// OLLAMA_ORIGINS does allow localhost, but that's a setting on the user's
// machine rather than something this app controls, and a browser fetch that
// works today breaks silently when someone tightens it.
//
// See index.js for the provider contract these two files implement.

const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");

// Models that can only produce embeddings can't hold a conversation, so they
// have no business in a "which model should answer me" dropdown. Ollama
// reports this per model in `details.capabilities`; older Ollama builds omit
// the field entirely, in which case assume the model is usable rather than
// hiding it.
function isChatCapable(model) {
    const capabilities = model.capabilities ?? model.details?.capabilities;
    if (!Array.isArray(capabilities)) return true;
    return capabilities.includes("completion") || capabilities.includes("tools");
};

export const id = "ollama";
export const label = "Ollama (local)";

export async function listModels() {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`ollama /api/tags returned ${response.status}`);

    const { models = [] } = await response.json();
    return models.filter(isChatCapable).map((model) => ({
        id: model.name,
        label: model.name,
        detail: model.details?.parameter_size ?? "",
    }));
};

// Yields { type: "delta" | "reasoning" | "done" } events. `reasoning` is a
// thinking model's chain of thought, which Ollama returns on its own
// `message.thinking` field rather than mixed into `message.content` — kept
// separate here so the console can show "still working" without pasting the
// model's scratchpad into the scrollback as if it were the answer.
export async function* chat({ model, system, prompt, history = [], format = null, signal }) {
    const messages = [
        ...(system ? [{ role: "system", content: system }] : []),
        ...history,
        { role: "user", content: prompt },
    ];

    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true, ...(format ? { format } : {}) }),
        signal,
    });

    if (!response.ok) {
        // Ollama puts a usable reason in the body ("model 'x' not found"),
        // which is far more actionable than the status code alone.
        const detail = await response.text().catch(() => "");
        throw new Error(`ollama /api/chat returned ${response.status}${detail ? `: ${detail.trim()}` : ""}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let meta = {};

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // NDJSON: a read can end mid-line, so the tail stays in `buffer`
        // until the newline that completes it arrives.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
            if (!line.trim()) continue;

            let event;
            try {
                event = JSON.parse(line);
            } catch {
                continue; // A malformed line is not worth killing the stream over.
            }

            if (event.error) throw new Error(event.error);

            const chunk = event.message?.content ?? "";
            const thinking = event.message?.thinking ?? "";
            if (thinking) yield { type: "reasoning", text: thinking };
            if (chunk) {
                text += chunk;
                yield { type: "delta", text: chunk };
            }

            if (event.done) {
                meta = {
                    model: event.model,
                    promptTokens: event.prompt_eval_count,
                    responseTokens: event.eval_count,
                    // Ollama reports nanoseconds; milliseconds is what the
                    // console shows.
                    durationMs: event.total_duration ? Math.round(event.total_duration / 1e6) : undefined,
                };
            }
        }
    }

    yield { type: "done", text, meta };
};
