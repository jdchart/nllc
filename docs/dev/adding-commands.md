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

## 2. A new field on channel or processor commands

If the new behavior is a param that should work on *every* channel (`/master`,
`/track_1`, any track) or *every* processor (`/reverb`, `/delay`, any custom one),
add it inside `channelCommand` or `processorCommand` instead — these are the
generic handlers every name in `nllc.tracks`/`nllc.processors`/`master` gets
routed through.

`channelCommand` example — adding a `/track_1 solo` flag (sketch; doesn't handle
un-soloing others):

```js
function channelCommand(nllc, channel, params) {
    if (Object.keys(params).length === 0) return channelSummary(channel);
    // ...
    const results = [];

    if ("gain" in params) { /* ... */ }
    if ("pan" in params) { /* ... */ }

    if (params.solo) {
        for (const t of nllc.tracks) t.gainNode.gain.value = t === channel ? t.gainNode.gain.value : 0;
        results.push(`${channel.name} soloed`);
    }
    // ...
};
```

Follow the existing pattern: check `"key" in params` for a value-bearing param,
`params.key` (truthy) for a boolean flag, push a human-readable string onto
`results`, and let the function join them at the end. Keep each param's logic
self-contained (a bad `synth=` shouldn't stop `gain=` in the same command from
applying — see how the existing handler tries/catches `synth=` locally rather than
letting a bad type abort the whole command).

## Command-name dispatch

`executeCommand(text)` (the function `createCommandRouter` returns) resolves a
command name in this order: `commands` (top-level) → `master` → `nllc.tracks` (by
`.name`) → `nllc.processors` (by `.name`) → `unknown command`. If you're adding an
entirely new *kind* of addressable object (not a track, not a processor), you'd
extend this dispatch chain in `executeCommand` itself, following the same
`track ? run(...) : ...` shape already there for tracks/processors.

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

If your new param should be rampable the same way `gain=`/`pan=`/any processor
param already are, don't reinvent the parsing — `parseCommand` already turns
`key=<value> <duration>[b]` into `params[key] = { value, duration, unit }`
instead of a plain scalar (`unit` is `"seconds"` or `"beats"`). Use the
existing helpers: `isRamp(params[key])` to check which shape you got,
`rampSeconds(nllc.clock, params[key])` to resolve the duration against tempo,
and `resolveStartTime(nllc.clock, params.at)` to turn an optional `at=beat`/
`at=cycle` into an absolute `AudioContext` startTime for `scheduleRamp()` (see
`channelCommand`'s `gain`/`pan` handling for the full pattern, including
surfacing `resolveStartTime`'s `warning` for an unrecognized `at=` value).
Remember to skip the `at` key in any generic `Object.entries(params)` loop
(see `processorCommand`) — it isn't itself a settable param.

## Parsing details you probably don't need to touch

`parseCommand(text)` (tokenizing `/name key=val key2="quoted val"`, including
the ramp-duration extension above) and `parseValue(raw)` (number/boolean/
quoted-string coercion) are generic and already used by every command — new
commands get quoting, optional `=` spacing, type coercion, and ramp parsing
for free. Only touch these if you need a fundamentally new syntax shape (e.g.
positional args) rather than another `key=value` pair.
