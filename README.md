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

Open `/` — it links to a blank session (`/code-editor`), a demo session
(`/code-editor/demo`, auto-loading `static/sessions/demo.json`), and a small
audio-options panel (output device, latency).
See the [ribbit tutorial](../ribbit/docs/user/tutorial.md) for a walkthrough of
your first commands.

## Building

```sh
npm run build
```

Preview the production build with `npm run preview`. To deploy, you'll need a
[SvelteKit adapter](https://svelte.dev/docs/kit/adapters) for your target
environment (this project currently uses `@sveltejs/adapter-auto`).
