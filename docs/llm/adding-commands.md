# LLM context: adding a command

Full tutorial with rationale: `docs/dev/adding-commands.md`. This is the condensed
recipe.

All command logic is in `src/lib/scripts/nllc-src/commands.js`. Extension
points:

1. **New top-level command** (like `/start`, `/add_track`, `/add_modulator`):
   add a key to the `commands` object inside `createCommandRouter(nllc)`.
   Handler signature: `(params) => string`. `params` is already parsed
   (numbers/booleans/quoted strings coerced, see `parseCommand`/`parseValue`).
   Return a string to echo to the console; thrown errors are caught
   automatically by the router's `run()` wrapper and turned into an error
   string — no need for your own try/catch. Always run a user-supplied
   number through `toNumber(raw, label)` rather than a bare `Number(...)` —
   it throws on a non-finite result instead of silently writing `NaN` into
   persistent state.

2. **New rampable param on every channel, processor, or modulator** (like
   `gain=`, or any processor/modulator's own params): wrap it as an
   `NLLCParam` (`param.js`) in the owning object's `this.params` map — see
   `docs/llm/building-processors.md`/`building-modulators.md`. `applyParams()`
   in `commands.js` is the one function that already does get/set/ramp/defer
   for any `NLLCParam`; `channelCommand` (gain/pan), `paramObjectCommand`
   (every processor/modulator param), and `/patch` (depth) all call into it —
   don't hand-roll ramp/instant/`at=` branching again.

3. **New non-rampable field on channel commands** (like `add_event`,
   `synth=`): add a branch inside `channelCommand`, following the existing
   `if ("key" in params) { ... results.push(...) }` pattern for value-bearing
   params, or `if (params.key) { ... }` for boolean flags. Keep each param
   independent so one bad param in a multi-param command doesn't block the
   others.

```js
// top-level example (this exact shape is how the real /clock command works)
const commands = {
    // ...existing...
    seed: (params) => {
        if (!("value" in params)) return `seed is ${nllc.randomSeed}`;
        nllc.randomSeed = toNumber(params.value, "seed");
        return `seed set to ${nllc.randomSeed}`;
    },
};
```

Dispatch order in `executeCommand`: top-level `commands` → `master` → track by
name → bus by name → processor by name → modulator by name → `unknown
command`. A bus (`/add_bus`) is addressed and handled exactly like a track —
both go through `channelCommand` — the only difference is a bus has no
`.source`, so synth-only params (`add_event`, `synth=`, `start`/`stop`) are
no-ops on it, same as on master.
`executeCommand` also splits one submitted line into multiple `/name ...`
segments before dispatch (`splitCommands`), so several commands typed on one
line run together — no extra code needed for a new command to participate.
A patch (`/patch`, `/unpatch`) doesn't fit this "addressed by its own name"
shape at all — it's a top-level command that branches on `id=` (adjust) vs.
`source=`/`dest=` (create); read it directly in `commands.js` if you're
adding another object kind shaped like this.

If a param genuinely shouldn't be rampable (like `/clock num_beats=` — a
fractional, shifting loop length makes no sense), reject a ramp spec
explicitly with a message rather than silently applying just the `.value`
half of it — see the `clock` command's `num_beats` branch.

If your ramp target genuinely isn't backed by a real `AudioParam` (the one
case in the codebase: `/clock bpm=`, since bpm is a plain number the clock
uses for beat↔time math, not a native `AudioParam`), you can't use
`NLLCParam`/`applyParams` — see `NLLCClock.rampBpm` for the stepped-timer
alternative, and reuse `isRamp(value)`/`rampSeconds(nllc.clock,
value)`/`resolveStartTime(nllc.clock, params.at)` directly the way the real
`clock` command does. Don't touch `parseCommand`/`parseValue` themselves
unless you need a genuinely new syntax shape (not another `key=value` pair,
and not another ramp-like suffix) — quoting, optional `=` spacing, type
coercion, and ramp duration parsing are already generic and shared by every
command.
