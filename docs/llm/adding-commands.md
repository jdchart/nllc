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
// top-level example (this exact shape is how the real /clock command works)
const commands = {
    // ...existing...
    seed: (params) => {
        if (!("value" in params)) return `seed is ${nllc.randomSeed}`;
        nllc.randomSeed = Number(params.value);
        return `seed set to ${nllc.randomSeed}`;
    },
};
```

Dispatch order in `executeCommand`: top-level `commands` → `master` → track by
name → processor by name → `unknown command`. `executeCommand` also splits one
submitted line into multiple `/name ...` segments before dispatch
(`splitCommands`), so several commands typed on one line run together — no
extra code needed for a new command to participate.

If your param should be rampable like `gain=`/`pan=`/processor params already
are, don't reinvent parsing: `parseCommand` already turns `key=<value>
<duration>[b]` into `params[key] = { value, duration, unit }` (unit is
`"seconds"` or `"beats"`) instead of a plain scalar. Use `isRamp(value)` to
detect it, `rampSeconds(nllc.clock, value)` for the duration in seconds, and
`resolveStartTime(nllc.clock, params.at)` to resolve an optional `at=beat`/
`at=cycle` into an absolute startTime for `scheduleRamp()` — see
`channelCommand`'s `gain`/`pan` handling in `commands.js` for the full
pattern. Don't touch `parseCommand`/`parseValue` themselves unless you need a
genuinely new syntax shape (not another `key=value` pair, and not another
ramp-like suffix) — quoting, optional `=` spacing, type coercion, and ramp
duration parsing are already generic and shared by every command.
