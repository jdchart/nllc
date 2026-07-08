# Adding commands

All command handling lives in `src/lib/scripts/nllc-src/commands.js`. There are two
places to add behavior, depending on scope.

## 1. A new top-level command

Top-level commands (`/start`, `/stop`, `/add_track`, `/tracks`) live in the
`commands` object inside `createCommandRouter`:

```js
export function createCommandRouter(nllc) {
    const commands = {
        start: () => { nllc.start(); return "engine started"; },
        stop: () => { nllc.stop(); return "engine stopped"; },
        add_track: (params) => {
            const track = nllc.createTrack(params);
            return `created ${track.name}`;
        },
        tracks: () => { /* ... */ },
        clock: (params) => { /* see the real one — bpm=/num_beats=, reports current values with no params */ },

        // add a new one, following the same "no params = report status" shape:
        seed: (params) => {
            if (!("value" in params)) return `seed is ${nllc.randomSeed}`;
            nllc.randomSeed = Number(params.value);
            return `seed set to ${nllc.randomSeed}`;
        },
    };
    // ...
};
```

(The real `/clock` command is a good template to read directly in
`commands.js` — it shows the "no params = report current state, else apply
each given param and collect a result message per param" shape used
throughout.)

Each handler receives the parsed `params` object (from `parseCommand`) and returns
a string that gets echoed into the console log (or throws/returns nothing — see
`run()`, which catches exceptions and turns them into an error string
automatically, so handlers don't need their own `try`/`catch`).

## 2. A new rampable param on channels, processors, or modulators

If the new behavior is a numeric param that should be gettable/settable/
rampable/deferrable (`at=`) — like `gain=`/`pan=`, any processor param, or any
modulator param — don't hand-roll get/set/ramp logic at all. Wrap it as an
`NLLCParam` (`param.js`) in the owning object's `this.params` map, and it's
done: `commands.js`'s `applyParams()` is the one function that already knows
how to instant-set, ramp, and defer *any* `NLLCParam`, and it's what
`channelCommand` (for gain/pan), `paramObjectCommand` (for every
processor/modulator param), and `/patch` (for depth) all call into. See
[creating-a-processor.md](creating-a-processor.md) and
[creating-a-modulator.md](creating-a-modulator.md) for how to define one on a
new processor/modulator class, and `channel.js`'s constructor for the
channel-level `gain`/`pan` example (gain adds a `decode`/`encode` taper;
pan doesn't need one).

If the new behavior is genuinely *not* a good fit for ramping (like
`/clock num_beats=` — a fractional, constantly-shifting loop length has no
sensible meaning), that's a legitimate call: reject a ramp spec explicitly
with a clear message rather than silently applying only the `.value` part of
it (see the `clock` top-level command's `num_beats` branch for the pattern).
Not every param has to be rampable just because the machinery makes it easy.

## 3. A new non-rampable field on channel commands

For channel-specific behavior that isn't a rampable param at all (like
`add_event`, `start`/`stop`, `synth=`), add it directly inside
`channelCommand`, following the existing pattern: check `"key" in params` for
a value-bearing param, `params.key` (truthy) for a boolean flag, push a
human-readable string onto `results`, and let the function join them at the
end. Keep each param's logic self-contained (a bad `synth=` shouldn't stop
`gain=` in the same command from applying — see how the existing handler
tries/catches `synth=` locally rather than letting a bad type abort the whole
command). Every user-supplied number should go through `toNumber(raw, label)`
rather than a bare `Number(...)` — it throws (caught automatically by `run()`)
on a non-finite result instead of silently writing `NaN` into engine state,
which is exactly the kind of bug that can otherwise persist long after the
one bad command that caused it (see `toNumber`'s doc comment in
`commands.js`).

## Command-name dispatch

`executeCommand(text)` (the function `createCommandRouter` returns) resolves a
command name in this order: `commands` (top-level) → `master` → `nllc.tracks`
(by `.name`) → `nllc.processors` (by `.name`) → `nllc.modulators` (by `.name`)
→ `unknown command`. If you're adding an entirely new *kind* of addressable
object (not a track, processor, or modulator), you'd extend this dispatch
chain in `executeCommand` itself, following the same `track ? run(...) : ...`
shape already there.

A patch (`/patch`, `/unpatch`) is a different shape entirely — it isn't
addressed by its own name in the dispatch chain above (a patch's compact id,
e.g. `x1`, isn't a name you type as `/x1 ...`); instead the top-level `/patch`
command itself branches on whether `id=` was given (adjust an existing
patch's depth) or `source=`/`dest=` were given (create a new one). Worth
reading directly in `commands.js` if you're adding another object kind that
doesn't fit the usual "addressed by its own name" shape.

## Multiple commands per submitted line

`executeCommand(text)` (returned by `createCommandRouter`) first calls
`splitCommands(text)`, which finds every `/name` occurrence in the submitted
line and dispatches each segment independently through the normal path,
joining their results with newlines. This is what lets
`/track_1 gain=0 8 /reverb wet=0.9 6b` run both together, scheduled off the
same instant (they execute synchronously in one call stack). You don't need to
do anything for a new command to participate in this — it's purely a
preprocessing step before dispatch. It does assume no param value contains a
literal `/`; none currently do.

## Ramp specs and the `at=` scheduling hint

`parseCommand` turns `key=<value> <duration>[b]` into `params[key] = { value,
duration, unit }` instead of a plain scalar (`unit` is `"seconds"` or
`"beats"`) — this is what `isRamp()` checks for. If your param is an
`NLLCParam` (see above), you get all of this for free through `applyParams()`
— you don't need to touch `isRamp`/`rampSeconds`/`resolveStartTime` yourself
at all.

Those helpers are still there directly for the rare case where a "value that
ramps over time" genuinely isn't backed by an `NLLCParam` — the one example
in the codebase is `/clock bpm=`, which calls `NLLCClock.rampBpm()` instead of
`applyParams`, because bpm isn't a native `AudioParam` at all (it's a plain
number the clock uses for its own beat↔time math) and so can't ride
`scheduleRamp()`'s `linearRampToValueAtTime` the way every other rampable
param can — see `clock.js`'s `rampBpm` and its doc comment for why that needs
its own stepped-timer approach. If you find yourself in a similar spot, read
the `clock` top-level command's `bpm` branch in `commands.js` directly rather
than reinventing the ramp-spec parsing: `isRamp(params[key])` to check which
shape you got, `rampSeconds(nllc.clock, params[key])` to resolve the duration
against tempo, and `resolveStartTime(nllc.clock, params.at)` to turn an
optional `at=beat`/`at=cycle` into an absolute `AudioContext` startTime.
Remember to skip the `at` key in any generic `Object.entries(params)` loop —
it isn't itself a settable param (`applyParams` already does this for you).

## Parsing details you probably don't need to touch

`parseCommand(text)` (tokenizing `/name key=val key2="quoted val"`, including
the ramp-duration extension above) and `parseValue(raw)` (number/boolean/
quoted-string coercion) are generic and already used by every command — new
commands get quoting, optional `=` spacing, type coercion, and ramp parsing
for free. Only touch these if you need a fundamentally new syntax shape (e.g.
positional args) rather than another `key=value` pair.
