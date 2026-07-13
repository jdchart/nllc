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

The whole session — every track, bus, processor, modulator, and patch — can
be saved to a `.json` file and loaded back, or captured as a named in-memory
"state" you can `/recall` later with a smooth ramp instead of a hard cut
(handy as a live "scene" tool). See
[docs/user/commands.md](docs/user/commands.md#session-and-states).

Built with SvelteKit + the Web Audio API. See [docs/](docs/) for full
documentation:

- **[docs/user](docs/user/)** — tutorial, command reference, synth/processor/
  modulator reference. Start here if you just want to use the app.
- **[docs/dev](docs/dev/)** — architecture, source walkthrough, and tutorials
  for extending the engine (new synths, processors, modulators, commands).
- **[docs/llm](docs/llm/)** — concise project/architecture summaries sized for
  use as LLM context.

## Developing

Install dependencies, then start the dev server:

```sh
npm install
npm run dev -- --open
```

Open `/` — it links to a blank session (`/code-editor`) and a demo session
(`/code-editor/demo`, auto-loading `static/sessions/demo.json` — a couple of
tracks, a reverb bus, an LFO patch, and a couple of saved states, if you just
want to hear something immediately) and a small audio-options panel (output
device, latency). See [docs/user/tutorial.md](docs/user/tutorial.md) for a
walkthrough of your first commands.

## Building

```sh
npm run build
```

Preview the production build with `npm run preview`. To deploy, you'll need a
[SvelteKit adapter](https://svelte.dev/docs/kit/adapters) for your target
environment (this project currently uses `@sveltejs/adapter-auto`).
