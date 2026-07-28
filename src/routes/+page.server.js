import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// static/ is served verbatim by SvelteKit and isn't part of the module graph,
// so there's nothing to import — the only way to know what's in it is to read
// the directory. That has to happen server-side (the browser can't list a
// directory over HTTP), hence a +page.server.js rather than a universal load.
// Resolved from the project root, which is the cwd for both `vite dev` and
// `vite build`.
const SESSIONS_DIR = path.resolve("static/sessions");

// One line of "what's in here" per session, so the dropdown says something
// more useful than a filename. Reads the same top-level keys session.js
// writes (see ribbit/src/session.js's snapshotSession).
function summarize(session) {
    const counts = [
        [session.tracks?.length ?? 0, "track"],
        [session.buses?.length ?? 0, "bus", "buses"],
        [session.modulators?.length ?? 0, "modulator"],
        [Object.keys(session.states ?? {}).length, "saved state"],
    ]
        .filter(([n]) => n > 0)
        .map(([n, singular, plural]) => `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`);

    const bpm = session.clock?.bpm;
    const parts = counts.length ? counts.join(", ") : "empty";
    return bpm ? `${parts} · ${bpm} bpm` : parts;
};

export async function load() {
    let files;
    try {
        files = await readdir(SESSIONS_DIR);
    } catch {
        // No static/sessions directory at all — a valid state (the homepage
        // just shows nothing to load), not an error worth failing the page for.
        return { sessions: [] };
    }

    const sessions = await Promise.all(
        files
            .filter((file) => file.endsWith(".json"))
            .sort()
            .map(async (file) => {
                // The URL segment /code-editor/<slug> maps back to
                // /sessions/<slug>.json, so the slug is just the basename.
                const slug = file.slice(0, -".json".length);
                try {
                    const session = JSON.parse(await readFile(path.join(SESSIONS_DIR, file), "utf8"));
                    return { slug, summary: summarize(session), valid: true };
                } catch {
                    // Listed anyway rather than hidden: a file that's there but
                    // unparseable is worth seeing in the dropdown, since
                    // silently omitting it looks identical to it not existing.
                    return { slug, summary: "couldn't be read — not valid JSON", valid: false };
                }
            }),
    );

    return { sessions };
};
