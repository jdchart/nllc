// /code-editor/<slug> loads static/sessions/<slug>.json. The segment is
// passed straight through to SessionPage as a URL; the fetch itself happens
// client-side in onMount (alongside the AudioContext the session loads into),
// so there's nothing to fetch here — this load exists only to hand the page
// its params without reaching for $app/state.
export function load({ params }) {
    return { slug: params.session };
};
