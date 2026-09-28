# NLLC documentation

NLLC (Natural Language Live Coding) is a SvelteKit **interface** for the
[`ribbit`](../../ribbit/) audio engine. These docs cover the app; the engine —
the object model, the full slash-command vocabulary, and how to extend it — is
documented in the [ribbit docs](../../ribbit/docs/).

- **[docs/user](user/)** — for people using the app: the console + mixer page,
  the demo sessions, saving/loading, the `/llm` assistant and its editable
  context folder, audio options, and where sample and pattern files live. For
  the commands you type into the console, see the
  [ribbit command reference](../../ribbit/docs/user/); for the hand-editable
  pattern format, [ribbit/docs/user/patterns.md](../../ribbit/docs/user/patterns.md).
- **[docs/dev](dev/)** — for people modifying the app: the SvelteKit structure,
  how it wires to `ribbit` (the single integration point), the mixer/console
  components, and the natural-language layer (providers, the streaming API
  routes, and how the prompt is assembled).
- **[docs/llm](llm/)** — concise, context-window-friendly summaries of the app
  for feeding to an LLM.
