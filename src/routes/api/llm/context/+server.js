// What `/llm --context` reports: which files in static/context/ are being
// injected and what they cost. Names and sizes only — the contents are
// already readable at /context/<file>.md, and the useful thing in a console
// is the budget.

import { json } from "@sveltejs/kit";
import { describeContext } from "$lib/server/llm/context.js";

export async function GET() {
    return json(await describeContext(), {
        // Re-read per request, like the prompt itself — editing a context
        // file and re-running /llm --context should show the new size.
        headers: { "cache-control": "no-store" },
    });
};
