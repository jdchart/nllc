import { readdir } from "node:fs/promises";
import path from "node:path";
import { json } from "@sveltejs/kit";

// What pattern packs exist in static/patterns/, and what's in each — the list
// a browser can't get for itself. Exactly the same constraint, and the same
// solution, as the /samples/manifest.json route next door: static/ isn't in
// the module graph and HTTP has no directory listing, so enumerating it has to
// happen server-side.
//
// This exists for ribbit's `patternvariator`, which loads a hand-written
// pattern by pack and name. The engine is host-agnostic and just fetches this
// URL; serving it is the host's side of that contract, exactly like serving
// the .json files under /patterns/ already is.
//
// The difference from the samples route is that the *categories are not
// fixed*: every subdirectory is a pack. Sample categories map onto
// percsampler's four hardcoded slot groups and a fifth would be meaningless,
// but a pack is just a folder of related patterns, so adding
// static/patterns/mypack/ and refreshing is the whole workflow.
//
// Same shadowing caveat as the samples route: static files win over routes for
// paths that exist on disk, so this only resolves while nobody drops a literal
// static/patterns/manifest.json in to shadow it.
const PATTERNS_DIR = path.resolve("static/patterns");

export async function GET() {
    const manifest = {};

    let packs;
    try {
        packs = await readdir(PATTERNS_DIR, { withFileTypes: true });
    } catch {
        // No patterns folder at all is an empty library, not a failure — the
        // engine already warns and carries on with no pattern loaded.
        return json(manifest);
    }

    for (const entry of packs) {
        if (!entry.isDirectory()) continue;

        let files;
        try {
            files = await readdir(path.join(PATTERNS_DIR, entry.name));
        } catch {
            continue;
        }

        // Paths are relative to /patterns/ (e.g. "hiphopdrums/boom-bap.json")
        // because that's the prefix the engine builds URLs from, and keeping
        // the pack in the string means a loaded pattern can report where it
        // came from without a parallel data structure.
        const patterns = files
            .filter((file) => path.extname(file).toLowerCase() === ".json")
            .sort()
            .map((file) => `${entry.name}/${file}`);

        // A pack with no patterns in it is omitted entirely rather than
        // offered as an empty choice — "random pack" must never be able to
        // land somewhere with nothing to play.
        if (patterns.length) manifest[entry.name] = patterns;
    }

    return json(manifest);
};
