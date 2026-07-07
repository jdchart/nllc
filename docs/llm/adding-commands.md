# LLM context: adding a command

Full tutorial with rationale: `docs/dev/adding-commands.md`. This is the condensed
recipe.

All command logic is in `src/lib/scripts/nllc-src/commands.js`. Two extension
points:

1. **New top-level command** (like `/start`, `/add_track`): add a key to the
   `commands` object inside `createCommandRouter(nllc)`. Handler signature:
   `(params) => string`. `params` is already parsed (numbers/booleans/quoted
   strings coerced, see `parseCommand`/`parseValue`). Return a string to echo to
   the console; thrown errors are caught automatically by the router's `run()`
   wrapper and turned into an error string — no need for your own try/catch.

2. **New field usable on every channel or every processor** (like `gain=`,
   `synth=`, or a processor's own params): add a branch inside `channelCommand`
   (for tracks + master) or `processorCommand` (for processors), following the
   existing `if ("key" in params) { ... results.push(...) }` pattern for
   value-bearing params, or `if (params.key) { ... }` for boolean flags. Keep each
   param independent so one bad param in a multi-param command doesn't block the
   others.

```js
// top-level example
const commands = {
    // ...existing...
    bpm: (params) => {
        if (!("value" in params)) return `bpm is ${nllc.clock.bpm}`;
        nllc.clock.setBpm(Number(params.value));
        return `bpm set to ${nllc.clock.bpm}`;
    },
};
```

Dispatch order in `executeCommand`: top-level `commands` → `master` → track by
name → processor by name → `unknown command`. Don't touch `parseCommand`/
`parseValue` unless you need a genuinely new syntax shape (not another
`key=value` pair) — quoting, optional `=` spacing, and type coercion are already
generic and shared by every command.
