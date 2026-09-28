import { error } from "@sveltejs/kit";

// A typo'd slug used to render a 200 with an empty session and a banner, which
// reads as "the session is empty" rather than "there is no such session". The
// file is a static asset, so a HEAD request is enough to know — and this runs
// during SSR too, so the 404 is a real status, not just a client-side notice.
export async function load({ params, fetch }) {
    const response = await fetch(`/sessions/${encodeURIComponent(params.session)}.json`, { method: "HEAD" });
    if (!response.ok) error(404, `No session "${params.session}" in static/sessions/`);
    return { slug: params.session };
};
