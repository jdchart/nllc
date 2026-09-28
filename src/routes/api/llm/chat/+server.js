// One turn of conversation, streamed back as NDJSON.
//
// NDJSON rather than SSE because the client is a fetch reader rather than an
// EventSource (SSE can't POST a body), and because the console wants tokens
// as they arrive — a request that takes twenty seconds to answer needs to
// look alive long before it's finished.
//
// Line shapes, one JSON object per line:
//   { type: "start",     provider, model }
//   { type: "reasoning", text }        a thinking model's scratchpad
//   { type: "delta",     text }        answer text, incremental
//   { type: "done",      text, meta, conversationId }
//   { type: "error",     message }
//
// Errors after the first byte arrive as an `error` line rather than an HTTP
// status: the response is already committed by then. Only request validation
// gets a real 4xx.

import { error } from "@sveltejs/kit";
import { getProvider, parseModelId } from "$lib/server/llm/index.js";
import { buildSystemPrompt } from "$lib/server/llm/context.js";

export async function POST({ request }) {
    let body;
    try {
        body = await request.json();
    } catch {
        error(400, "expected a JSON body");
    }

    const { model: qualified, prompt = "", history = [], format = null, conversationId = null } = body;

    const parsed = parseModelId(qualified);
    if (!parsed) error(400, `unknown model "${qualified}" — expected "<provider>:<model>"`);
    if (typeof prompt !== "string" || !prompt.trim()) error(400, "prompt is empty");

    // Assembled here rather than sent by the client. The static half of the
    // prompt is files on disk (static/context/*.md), so the server is where
    // it lives — and it stays byte-identical across turns, which is what
    // lets a provider cache it. Only the volatile half (the live session
    // state, folded into the user turn) comes from the browser.
    const system = await buildSystemPrompt();

    const provider = getProvider(parsed.providerId);
    const encoder = new TextEncoder();

    // The browser aborting (the user typed /llm --stop, or navigated away)
    // has to reach the provider so it can close its socket or kill its child
    // process — otherwise a cancelled question keeps burning a model.
    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort(), { once: true });

    const stream = new ReadableStream({
        async start(output) {
            const send = (obj) => output.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));

            try {
                send({ type: "start", provider: parsed.providerId, model: parsed.model });

                for await (const event of provider.chat({
                    model: parsed.model,
                    system,
                    prompt,
                    history,
                    format,
                    conversationId,
                    signal: controller.signal,
                })) {
                    send(event);
                }
            } catch (cause) {
                // An abort is the client's own doing, so there's nobody left
                // to tell — anything else is a real failure the console
                // should print.
                if (!controller.signal.aborted) send({ type: "error", message: cause.message });
            } finally {
                output.close();
            }
        },
        cancel() {
            controller.abort();
        },
    });

    return new Response(stream, {
        headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
        },
    });
};
