import { readdir } from "node:fs/promises";
import path from "node:path";
import { json } from "@sveltejs/kit";

// What's in static/samples/, by category — the list a browser can't get for
// itself. Same constraint (and same solution) as the session dropdown's
// +page.server.js next door: static/ isn't in the module graph and HTTP has
// no directory listing, so enumerating it has to happen server-side.
//
// This exists for ribbit's `percsampler`, which picks its kit at random from
// each category and so needs to know what the candidates *are*. The engine is
// host-agnostic and just fetches this URL; serving it is the host's side of
// that contract, exactly like serving the .wav files under /samples/ already
// is.
//
// The route path deliberately sits under /samples/ alongside the files it
// describes. Static files win over routes for paths that actually exist on
// disk, so this only resolves as long as nobody drops a literal
// static/samples/manifest.json in to shadow it.
const SAMPLES_DIR = path.resolve("static/samples");

// Only the categories percsampler knows about, in its own slot order — a
// stray directory in static/samples/ is ignored rather than silently
// becoming a fifth category the engine has no mapping for.
const CATEGORIES = ["kicks", "snares", "hats", "percs"];

const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac"];

export async function GET() {
    const manifest = {};

    for (const category of CATEGORIES) {
        let files;
        try {
            files = await readdir(path.join(SAMPLES_DIR, category));
        } catch {
            // A missing category folder is an empty one, not a failure: the
            // engine already has to cope with a category yielding no
            // candidates (it just leaves those slots unfilled), and failing
            // the whole request would take the other three down with it.
            manifest[category] = [];
            continue;
        }

        // Paths are relative to /samples/ (e.g. "kicks/CLAUDE - kick01.wav")
        // because that's the prefix the engine already builds URLs from, and
        // keeping the category in the string is what lets a slot report which
        // category it came from without a parallel data structure.
        manifest[category] = files
            .filter((file) => AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase()))
            .sort()
            .map((file) => `${category}/${file}`);
    }

    return json(manifest);
};
