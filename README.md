# NLLC — Natural Language Live Coding

A browser-based live-coding music environment. Type slash-commands into a
console to create and control synths, samplers, and effects, all playing
against a shared, looping clock — a small, text-driven take on Max/MSP or
SuperCollider. The long-term goal is to drive it with natural language instead
of commands, via a local Ollama model.

Built with SvelteKit + the Web Audio API. See [docs/](docs/) for full
documentation:

- **[docs/user](docs/user/)** — tutorial, command reference, synth/processor
  reference. Start here if you just want to use the app.
- **[docs/dev](docs/dev/)** — architecture, source walkthrough, and tutorials
  for extending the engine (new synths, processors, commands).
- **[docs/llm](docs/llm/)** — concise project/architecture summaries sized for
  use as LLM context.

## Developing

Install dependencies, then start the dev server:

```sh
npm install
npm run dev -- --open
```

Open `/code-editor` — that's the whole app. See
[docs/user/tutorial.md](docs/user/tutorial.md) for a walkthrough of your first
commands.

## Building

```sh
npm run build
```

Preview the production build with `npm run preview`. To deploy, you'll need a
[SvelteKit adapter](https://svelte.dev/docs/kit/adapters) for your target
environment (this project currently uses `@sveltejs/adapter-auto`).
