import { readdir } from "node:fs/promises";
import path from "node:path";
import { json } from "@sveltejs/kit";

// What's in static/samples/, by category — the list a browser can't get for
// itself. Same constraint (and same solution) as the session dropdown's
// +page.server.js next door: static/ isn't in the module graph and HTTP has
// no directory listing, so enumerating it has to happen server-side.
//
// This exists for ribbit's sample-backed synths — `percsampler`, which picks
// its kit at random from each drum category, and `granular`, which picks one
// source recording at random from a named folder — both of which need to know
// what the candidates *are*. The engine is host-agnostic and just fetches this
// URL; serving it is the host's side of that contract, exactly like serving
// the .wav files under /samples/ already is.
//
// The route path deliberately sits under /samples/ alongside the files it
// describes. Static files win over routes for paths that actually exist on
// disk, so this only resolves as long as nobody drops a literal
// static/samples/manifest.json in to shadow it.
const SAMPLES_DIR = path.resolve("static/samples");

// The four percsampler knows about, in its own slot order. These are listed
// first and always present (empty if the folder is missing) because that
// synth's slot arithmetic depends on them existing — every *other* directory
// is published too, but as an ordinary folder nothing special is promised
// about.
const CATEGORIES = ["kicks", "snares", "hats", "percs"];

const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac"];

// Paths are relative to /samples/ (e.g. "kicks/CLAUDE - kick01.wav") because
// that's the prefix the engine already builds URLs from, and keeping the
// folder in the string is what lets a slot report where it came from without
// a parallel data structure.
async function listFolder(folder) {
    let files;
    try {
        files = await readdir(path.join(SAMPLES_DIR, folder));
    } catch {
        // A missing folder is an empty one, not a failure: the engine already
        // copes with a folder yielding no candidates (percsampler leaves those
        // slots unfilled, granular warns and stays silent), and failing the
        // whole request would take every other folder down with it.
        return [];
    }
    return files
        .filter((file) => AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase()))
        .sort()
        .map((file) => `${folder}/${file}`);
};

export async function GET() {
    const manifest = {};

    for (const category of CATEGORIES) manifest[category] = await listFolder(category);

    // Everything else in static/samples/. Unlike the drum categories these
    // aren't fixed — the same rule the patterns manifest next door already
    // follows for packs — so dropping static/samples/<folder>/ in and
    // refreshing is the whole workflow for a new granular source library. An
    // empty one is omitted rather than offered as a choice that can't play.
    let entries;
    try {
        entries = await readdir(SAMPLES_DIR, { withFileTypes: true });
    } catch {
        return json(manifest);
    }

    for (const entry of entries) {
        if (!entry.isDirectory() || CATEGORIES.includes(entry.name)) continue;
        const files = await listFolder(entry.name);
        if (files.length) manifest[entry.name] = files;
    }

    return json(manifest);
};
