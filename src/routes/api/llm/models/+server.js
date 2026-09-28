// What the homepage's model dropdown is filled from. Same reason the session
// and sample manifests are server routes: the things being enumerated (a
// local daemon's model list, a binary on PATH) aren't reachable from a
// browser at all.
//
// Never throws for a provider being unavailable — each group carries its own
// `error` string so the page can say *why* a group is empty rather than
// silently showing nothing. See listAllModels.

import { json } from "@sveltejs/kit";
import { listAllModels } from "$lib/server/llm/index.js";

export async function GET() {
    return json({ providers: await listAllModels() }, {
        // Plugging in a model (`ollama pull`) and refreshing should show it.
        headers: { "cache-control": "no-store" },
    });
};
