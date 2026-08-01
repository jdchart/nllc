# NLLC — Natural Language Live Coding

A browser-based live-coding music environment. Type slash-commands into a
console to create and control synths, samplers, effects, buses (shared send
destinations for sub-mixes or shared effects), and patchable modulators (LFOs
and the like, connected into any parameter — a small modular synthesis
layer), all playing against a shared, looping clock — a small, text-driven
take on Max/MSP or SuperCollider. Some modulators generate notes instead of a
continuous signal — patch one into a track's control input (`dest=<track>.notes`)
for algorithmic pattern generation that runs alongside whatever you've
authored by hand. The long-term goal is to drive it with natural language
instead of commands, via a local Ollama model.

NLLC is the **interface**; the audio engine lives in a separate package,
[`ribbit`](../ribbit/) (a sibling in this workspace). NLLC is a SvelteKit
console + mixer that drives one `ribbit` engine instance. The engine — the
object model, the full slash-command vocabulary, session save/load, and how to
add new synths/processors/modulators/commands — is documented in the
[ribbit docs](../ribbit/docs/).

The whole session — every track, bus, processor, modulator, and patch — can
be saved to a `.json` file and loaded back, or captured as a named in-memory
"state" you can `/recall` later with a smooth ramp instead of a hard cut
(handy as a live "scene" tool).

## Documentation

Built with SvelteKit; the engine is `ribbit` + the Web Audio API. See
[docs/](docs/):

- **[docs/user](docs/user/)** — using the app (console + mixer, sessions, audio
  options). For the commands themselves, see the
  [ribbit command reference](../ribbit/docs/user/).
- **[docs/dev](docs/dev/)** — the SvelteKit structure and how it wires to
  `ribbit`.
- **[docs/llm](docs/llm/)** — concise app summaries sized for LLM context.

## Developing

`ribbit` is wired in as an npm workspace, so install from the **workspace root**
(one `npm install` links `ribbit` into this app and edits to it are live):

```sh
cd ..            # workspace root (parent of nllc/ and ribbit/)
npm install
cd nllc
npm run dev -- --open
```

Open `/` — it links to a blank session (`/code-editor`), offers a dropdown of
every `.json` in `static/sessions/` to open at `/code-editor/<name>`, and has a
small audio-options panel (output device, latency). Drop a file saved with
`/save_session` into `static/sessions/` and it appears in that dropdown.
Each session prints a short readme in the console when it opens, saying what it
is and which commands to try — so the quickest way in is to open one and read
what it tells you. `percs-demo` is a four-track drum kit driven by a generated
rhythm through reverb and delay buses; `euclid-demo` is the same idea built on
a euclidean grid instead; `euclid-ghosts` runs both generators at once, a fixed
backbone with quiet off-beat ghost notes around it. `pattern-drums` and
`pattern-chords` play *hand-written* material instead of generated —
respectively a varied hip-hop kit and chords/melody on plucked strings.
`goodenizer-demo` tours the dynamics and tone processors: parallel compression,
saturation, a tilt EQ, a limiter, and the `goodenizer` that combines all four.
`granular-pad` makes chords out of field recordings — three `granular` tracks,
each playing a foley sample back as a cloud of overlapping grains.
Every session runs one of those on master as `glue`, so `/glue mix=0` will A/B
the processing in any of them.
See the [ribbit tutorial](../ribbit/docs/user/tutorial.md) for a walkthrough of
your first commands.

### Samples

`static/samples/` is served at `/samples/`, with `kicks/`, `snares/`, `hats/`
and `percs/` subfolders plus `foley/` (field recordings — rain, rivers, birds,
glass). The engine's `percsampler` builds a kit by picking from the four drum
folders at random, and `granular` picks one recording from `foley/` the same
way, so the app also serves `/samples/manifest.json` (a server route that reads
the folder — a browser can't list a directory over HTTP). Adding a `.wav` to
any of those folders — or adding a folder — is the whole workflow: no code
change, and no restart under `vite dev`.

### Patterns

`static/patterns/` is served at `/patterns/`, and holds **hand-written**
musical material — drum rhythms, chord progressions, melodies — that the
engine's `patternvariator` plays and varies. Each subfolder is a pack
(`hiphopdrums/`, `darkchords/`, `ambientchords/`, `melodies/` ship), and the app serves
`/patterns/manifest.json` the same way it does for samples and for the same
reason.

These are meant to be edited. A drum pattern is a character grid, where `x` is
a hit, `.` a rest, and spaces are ignored so you can see the bar:

```json
{ "kind": "drums", "step_beats": 0.25,
  "lanes": { "kicks":  "x... ..x. ..x. ....",
             "snares": ".... x... .... x...",
             "hats":   "x.x." } }
```

Adding a `.json` (or a whole new pack folder) is the whole workflow. Full
format reference: [ribbit/docs/user/patterns.md](../ribbit/docs/user/patterns.md).

## Building

```sh
npm run build
```

Preview the production build with `npm run preview`. To deploy, you'll need a
[SvelteKit adapter](https://svelte.dev/docs/kit/adapters) for your target
environment (this project currently uses `@sveltejs/adapter-auto`).
