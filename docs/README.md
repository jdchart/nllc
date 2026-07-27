# NLLC documentation

NLLC (Natural Language Live Coding) is a SvelteKit **interface** for the
[`ribbit`](../../ribbit/) audio engine. These docs cover the app; the engine —
the object model, the full slash-command vocabulary, and how to extend it — is
documented in the [ribbit docs](../../ribbit/docs/).

- **[docs/user](user/)** — for people using the app: the console + mixer page,
  the demo sessions, saving/loading, and audio options. For the commands you
  type into the console, see the [ribbit command reference](../../ribbit/docs/user/).
- **[docs/dev](dev/)** — for people modifying the app: the SvelteKit structure,
  how it wires to `ribbit` (the single integration point), and the mixer/console
  components.
- **[docs/llm](llm/)** — concise, context-window-friendly summaries of the app
  for feeding to an LLM.
