# Source overview

All DSP/engine code lives in `src/lib/scripts/nllc-src/`. Base classes
(`synth.js`, `processor.js`, `modulator.js`, `channel.js`, etc.) live directly
in this folder; non-base implementations live one level down, grouped by
kind — `synths/oscsynth.js`, `synths/sampler.js`, `processors/reverb.js`,
`processors/delay.js`, `modulators/lfo.js` — so adding a new one is "add a
file to the matching subfolder, plus one registry line in `nllc.js`," with no
other file needing to change. Files below are listed roughly bottom-up
(dependencies first).

## `taper.js`

Pure math, no classes. `positionToGain(position)` / `gainToPosition(gain)`: an
exponential taper (`TAPER_K = 6`) between a linear 0–1 control position (fader,
`gain=` command param) and the actual 0–1 gain value, so equal position steps read
as equal loudness steps. Used by `NLLCChannel`'s `gain` param (see `param.js`
below) and by `MixerChannel.svelte`'s fader — both need to convert in both
directions.

## `param.js`

`NLLCParam` — the one class every rampable/patchable parameter is built from,
on every kind of object that has one: a channel's `gain`/`pan`, a processor's
own params, a modulator's own params, a patch's `depth`. Wraps a single raw
`AudioParam` plus:

- optional `decode`/`encode` — a value transform between the user-facing
  number and the actual `AudioParam` value (used by channel `gain`, whose
  user-facing 0–1 position is exponentially tapered via `taper.js` onto the
  underlying gain value; everything else defaults to identity).
- optional `min`/`max` — clamped by `.clamp(value)` (channel gain/pan use
  this; processor/modulator params default to unclamped).
- optional `onSet` — overrides the instant-set path for a param that has to
  fan a single value out across more than one node (`NLLCDelay`'s `time`
  writes both `delayL.delayTime` and `delayR.delayTime`, the latter offset for
  stereo width). Ramping/deferred `at=` scheduling still only animates the
  "primary" `.audioParam` directly — `onSet` only affects the plain
  instant-set case.

`.get()`/`.set(value)`/`.clamp(value)` are the whole public surface;
`.audioParam` is public too, and is what `commands.js`'s `applyParams` reaches
into directly for ramping/deferred scheduling. Before this class existed, a
param's `.params` entry (a hand-written `{get,set}` closure) and its
same-named raw-`AudioParam` getter (e.g. a processor's `get wet()`) were two
independent things that had to be kept in sync by convention — `NLLCParam` is
the single source of truth for both, so there's nothing left that can drift
apart. A class that still exposes a getter like `get wet()` today (for use as
an `NLLCAutomationEvent` target, e.g. `reverb.wet` in a pattern-automation
call) does so as a thin delegate onto `this.params.wet.audioParam`, not a
second implementation.

## `event.js`

`NLLCEvent({ beat, pitch, degree, velocity = 1, duration = 0.25 })` — a plain
data object, one entry in a synth's `events` array. `beat` is loop-relative (0
to `loopLengthBeats`). `pitch` defaults to `60` only if neither `pitch` nor
`degree` is given (so a `degree`-only event doesn't also carry a stale default
pitch). No other behavior; synths interpret `pitch`/`degree`/`velocity`/
`duration` however they like (`NLLCOscSynth` treats `pitch` as a MIDI note and
resolves `degree` against the shared harmony context at trigger time, see
[harmony.js](#harmonyjs); `NLLCSampler` treats `pitch` as a sample-slot index
and ignores `degree` entirely).

## `harmony.js`

`createHarmonyContext()` returns `{ root, scale }` (default: root `60`, a
chromatic `scale` — every semitone). `resolveDegree(harmony, degree)` maps a
(possibly negative, possibly multi-octave) scale-degree to a MIDI note number,
wrapping into higher/lower octaves via `scale.length`. This is the hook only —
chromatic `scale` makes `degree` behave as a plain semitone offset from `root`
until real scale/chord logic (and a `/harmony` console command to change
`root`/`scale` at runtime) gets built. `NLLC` constructs one shared instance
and threads it into every synth (see [architecture.md](architecture.md#harmony-context)).

## `automation.js`

`NLLCAutomationEvent({ beat, duration, target, from, to, curve, once })` — a
parameter ramp. `target` is a real `AudioParam` (e.g. `track.volume`,
`reverb.wet`, or any `NLLCParam`'s own `.audioParam`). A private `applyRamp(param,
time, endTime, from, to, curve)` is the one place that turns a curve name into
actual Web Audio ramp calls (`linearRampToValueAtTime` /
`exponentialRampToValueAtTime` / `setTargetAtTime` for `curve: "target"`, an
exponential approach useful for smoother/asymptotic moves). Two exported
functions call into it: `scheduleAutomationEvent(time, event, secondsPerBeat)`,
called directly by `NLLCClock` for loop-position pattern automation, and
`scheduleRamp(audioContext, param, from, to, durationSeconds, { startTime,
curve })`, called directly by the command router (via `commands.js`'s
`applyParams`) for one-off console ramps (`/track_1 gain=0 3`) — anchored to
an absolute time (`audioContext.currentTime` by default) rather than a
loop-relative beat, and never registered with the clock. See
[architecture.md](architecture.md#two-ramp-scheduling-paths-one-curve-implementation).

## `clock.js` — `NLLCClock`

The scheduler. See [architecture.md](architecture.md#the-clock-is-a-lookahead-scheduler-over-units)
for the full model. Key surface: `addUnit`/`removeUnit`, `start`/`stop`,
`setBpm(bpm)` (glitch-free — preserves the current playback beat across a
tempo change while running; also cancels any in-flight `rampBpm`),
`rampBpm(targetBpm, durationSeconds, { startTime })` (glides tempo over time —
bpm isn't a native `AudioParam`, so unlike a channel/processor param this
can't ride `linearRampToValueAtTime`; it steps `_applyBpm` repeatedly on a
short `setTimeout`, each step re-deriving `startTime` the same glitch-free way
`setBpm` always has), and `setLoopLengthBeats(beats)` (changes the loop
length; no rebasing needed since `_scheduleRange` reads it fresh every tick;
deliberately has no ramp equivalent — a fractional, constantly-shifting loop
length has no sensible meaning). All exposed via `/clock bpm= num_beats=`
(see [user/commands.md](../user/commands.md)). `beatToTime(beat)` converts a
beat position to an absolute `AudioContext` timestamp; `currentBeat()`,
`nextBeatTime()`, and `nextCycleTime()` compute the live playback position and
the next beat/loop-boundary timestamps — the anchor points a ramp's or a
deferred instant set's `startTime` uses for `at=beat`/`at=cycle`.

`_tick()` wraps its call to `_scheduleRange` in a try/catch: a single bad
event or param (e.g. a value that ends up passing a non-finite number into a
native `AudioParam` call, which throws) can only drop that one scheduling
pass — the `setTimeout` reschedule immediately after is unconditional, so one
bad command can never permanently kill the whole engine's scheduling loop.
This pairs with `commands.js`'s `toNumber()` guard (see below), which is the
first line of defense — reject bad input before it ever reaches an
`AudioParam` call — with the tick-level try/catch as a second, structural
line of defense for anything that gets through anyway.

## `channel.js` — `NLLCChannel`

Base class for anything with a fader, pan, an insert chain, and one or more
sends: `master`, every `NLLCTrack`, and every bus are one of these. Owns
`input`/`panner`/`gainNode` nodes, the `processors` array, and the `sends`
array. `volume`/`pan` getters expose the underlying `AudioParam`s directly (so
they can be automation targets or bound straight into the UI); `output`
(aliasing `gainNode`, the post-fader signal) lets a channel double as a patch
source (see `patch.js`) the same way a synth's or processor's own `output`
can. `params` (`{ gain: NLLCParam, pan: NLLCParam }`, see `param.js`) is the
console/UI-facing surface `commands.js`'s `applyParams` uses — `gain` wraps
`gainNode.gain` through the position↔gain taper (`taper.js`), `pan` wraps
`panner.pan` directly, both clamped (`0..1` / `-1..1`).
`addProcessor`/`removeProcessor`/`setProcessorActive` all end by calling
`_rewireChain()`, which is the only place that actually connects/disconnects
the `input → panner → gainNode` portion of the chain — everything else just
mutates the `processors` array and lets rewiring follow. `_rewireChain()`
never touches `sends` — those hang directly off `gainNode`.

`addSend(destination, { destName, gain })` creates one more independent
`gainNode → sendGain → destination.input` edge (throws if `destination ===
this`) and returns `{ id, destination, destName, params: { gain: NLLCParam } }`;
`removeSend(id)` tears down and forgets one. `connect(destination, destName)`
is sugar over both: clear every existing send, add a single fresh one at gain
1 — the historical single-destination behavior, still the default for a
freshly-created track/bus. `destName` is display-only (what `channelSummary`
prints), resolved by whoever calls `addSend`/`connect` — `channel.js` itself
never resolves names.

## `track.js` — `NLLCTrack extends NLLCChannel`

Adds exactly one thing over `NLLCChannel`: a `.source` (a synth) whose `.output`
feeds the track's `.input`. `setSource(newSource)` is how `/track_1 synth=sampler`
swaps synths at runtime without touching the track's gain/pan/inserts. A
**bus** (created via `NLLC.createBus`/`/add_bus`) is *not* an `NLLCTrack` — it's
a bare `NLLCChannel` with no `.source` at all, registered in `nllc.buses`
instead of `nllc.tracks`. It exists purely to be a named `destination` other
channels' sends can point at (see `channel.js` above and `nllc.js` below).

## `synth.js` — `NLLCSynth` (base)

Minimal: `name`, `output` (a `GainNode` — subclasses connect their voices into
this), `events`/`automation` arrays, `params` (empty — see
[creating-a-synth.md](creating-a-synth.md) if you want a synth with runtime
params), `active` (transport pause flag, checked by the clock, not a bypass in the
routing sense), and a no-op `trigger()` for subclasses to override.

## `synths/oscsynth.js` — `NLLCOscSynth extends NLLCSynth`

One `OscillatorNode` + envelope `GainNode` per triggered note (see
[objects.md](../user/objects.md) for the envelope shape). `trigger()` resolves
`event.degree` via `resolveDegree(this.harmony, event.degree)` when present,
falling back to `event.pitch` otherwise. Starts with an empty `events` array —
see [commands.md](../user/commands.md) for `add_event`/`clear_events`.

## `synths/sampler.js` — `NLLCSampler extends NLLCSynth`

Loads `SAMPLE_FILES` (hardcoded list, from `static/samples/`) into `slots` via
`fetch` + `decodeAudioData`, URL-encoding filenames since they contain spaces.
Loading is async and **not awaited** by anything (`this._loaded` is stored but
never checked before `trigger()` — a hit that lands before its buffer finishes
loading just silently no-ops). `trigger()` mod-wraps `event.pitch` into a valid
slot index (handles negative pitches correctly, not just `%`); `event.degree`
is ignored entirely (pitch is always a slot index here, never resolved against
harmony). Starts with an empty `events` array, same as `NLLCOscSynth`.

## `processor.js` — `NLLCProcessor` (base)

Mirrors `NLLCSynth`: `name`, `input`/`output` (both `GainNode`s — subclasses wire
their own DSP between them), `active` (routing bypass, read by
`Channel._rewireChain`), `params` (`{ paramName: NLLCParam }` — see `param.js`
— this *is* meant to be filled in by subclasses; it's the introspection
surface the command router uses for `/reverb wet=0.5` and `/reverb help`),
`automation`.

## `processors/reverb.js` — `NLLCReverb extends NLLCProcessor`

Convolution reverb against a synthetically-generated impulse response
(`buildImpulseResponse`: exponentially-decaying random noise per channel — no
external IR file). Parallel wet/dry: `input` connects straight to `output` (dry)
*and* to the convolver chain (wet, via `wetGain`). `params.wet` is an
`NLLCParam` wrapping `wetGain.gain`; `get wet()` is a thin alias onto
`params.wet.audioParam` (kept for use as an `NLLCAutomationEvent` target, e.g.
the demo bootstrap's fade-in).

## `processors/delay.js` — `NLLCDelay extends NLLCProcessor`

Stereo ping-pong delay: a `ChannelSplitter`/`ChannelMerger` pair around two
independent `DelayNode`s, cross-feeding each channel's output into the *other*
channel's delay line (`delayL → feedbackL → delayR`, and vice versa) rather than
back into itself, plus a small `stereoOffset` added to the right channel's delay
time for width. `time`/`feedback` are `NLLCParam`s whose `onSet` fans an
instant set out across both L/R nodes (`time` also adds `stereoOffset` to the
R side) — ramping/deferred `at=` scheduling still only animates the L side
directly, a pre-existing limitation unchanged by the `NLLCParam` consolidation.
`wet` is a plain single-node `NLLCParam`. Same `get time()`/`get feedback()`/
`get wet()` alias pattern as `NLLCReverb`.

## `modulator.js` — `NLLCModulator` (base)

Base class for every modulation source (see `modulators/lfo.js`). Structurally a
processor's sibling — it's named/addressable and has `params` the exact same
way — but it never sits in a channel's insert chain; it exists purely to be
patched (see `patch.js`) into some other object's parameter. `output` is a
plain `GainNode`; by convention a modulator's raw output is bipolar
(roughly `-1..1`), since a *patch*'s own `depth` (not the modulator) decides
how hard that signal pushes any given destination — the same modulator can
drive several destinations at different depths.

## `modulators/lfo.js` — `NLLCLFO extends NLLCModulator`

A continuously-running `OscillatorNode` (started once in the constructor,
never stopped) connected straight into `this.output` — a bipolar control
signal at `freq` Hz. `params.freq` is an `NLLCParam` wrapping
`osc.frequency`; `get freq()` is the same kind of thin alias as a processor's
`get wet()`.

## `patch.js` — `NLLCPatch`

One "patch cable": connects a source object's `.output` (a modulator, but
also a track/master's post-fader signal or a processor's post-effect signal —
anything with an `.output`) into a destination `AudioParam`, through its own
`depthGain` (attenuator) node — `sourceObject.output → depthGain →
destParam`. `depth` lives on the patch, not either endpoint, specifically so
the same source can drive several destinations at different amounts, and
`params.depth` (an `NLLCParam` wrapping `depthGain.gain`) makes it rampable
the exact same way a processor param is. Stores `sourceObject`/`destObject`
(plus display-only `sourceName`/`destName` strings) so `NLLC` can
cascade-remove a patch when either endpoint is itself torn down (see
`nllc.js`). `disconnect()` tears down both Web Audio connections; it must run
*before* the endpoint's own blanket `.disconnect()` in `removeTrack`/
`removeProcessor`/`removeModulator`, since a specific-argument `.disconnect(node)`
throws if that connection was already severed by a bare `.disconnect()`.

## `commands.js`

No classes — a closure-based router. `parseCommand(text)` is the tokenizer
(regex-based key=value parser with quoting, optional `=` whitespace, and an
optional trailing duration token that turns a value into a ramp spec
`{ value, duration, unit }` — see [user/commands.md](../user/commands.md#syntax));
`isRamp()`/`rampSeconds()`/`resolveStartTime()` are the small shared helpers
every ramp-aware command uses to turn a ramp spec into a `scheduleRamp()`
call, including resolving `at=beat`/`at=cycle` against the clock.
`toNumber(raw, label)` converts a parsed value to a number, *throwing* (not
returning `NaN`) if it isn't finite — this is what turns a bad numeric param
into a clean caught error instead of silently writing `NaN` into persistent
engine state (e.g. `clock.bpm`). `setInstant(audioContext, param, value,
startTime)` writes a value onto an `AudioParam` via
`cancelScheduledValues`+`setValueAtTime` rather than a direct `.value =`
assignment, so a deferred (`at=`) *instant* set is possible, not just a
deferred ramp.

`applyParams(nllc, paramsMap, input, { startTime, label }, { reportUnknown })`
is the one function that knows how to get/set/ramp/defer any `NLLCParam` (see
`param.js`) against a parsed command value — shared by `channelCommand`
(gain/pan), `paramObjectCommand` (every processor/modulator param), and the
`/patch` command (depth), replacing what used to be three separate hand-rolled
copies of the same ramp/instant/`at=` branching.

`channelCommand` and `paramObjectCommand` are the two shapes of object the
router knows how to talk to: `channelCommand` handles a track, a bus, or
master (gain/pan via `applyParams`, plus channel-specific params like
`add_event`/`synth=`/`add_processor=`, and routing: `out=`/`add_send=`/
`remove_send=`/`send=`+`send_gain=` against the channel's own `sends` — see
`channel.js`'s `addSend`/`removeSend`/`connect` above); `paramObjectCommand`
is shared by `processorCommand` and `modulatorCommand` (both are just
"addressed by name, expose `.params`" — the only difference is which
`nllc.remove*` function gets called for `remove_self`). `channelCommand`'s
`remove_self` branch checks `nllc.buses.includes(channel)` to call
`removeBus` instead of `removeTrack` for a bus.

Both dispatch to one of three outcomes: `channelSummary`/`paramObjectSummary`
(no params — condensed one-liner), `channelHelp`/`paramObjectHelp` (`help` —
every param's value+range via the shared `formatParamLine`, plus every
command that object kind accepts, spelled out with a usage note), or actually
applying whatever param/command was given. The help builders read
`nllc.synthTypes`/`processorTypes`/`modulatorTypes` (see `nllc.js` below) to
list available `synth=`/`add_processor=`/`add_modulator` types without
hardcoding them.

`createCommandRouter(nllc)`
returns `{ executeCommand, suggest }` — `executeCommand` ties the above into
one function, first splitting one submitted line into multiple `/name ...`
segments (`splitCommands`, letting `/track_1 gain=0
8 /reverb wet=0.9 6b` run both together) before dispatching each — in order,
against top-level `commands`, `master`, `nllc.tracks`, `nllc.buses`,
`nllc.processors`, then `nllc.modulators`. See
[adding-commands.md](adding-commands.md).

`suggest(input, cursorPos)` is the console's ghost-text completion (consumed
by `CodeEditor.svelte` — see [architecture.md](architecture.md#console-suggestions-ghost-text-completion)),
returned alongside `executeCommand` (rather than attached to it as a
property) specifically so it can close over the same `commands` object —
`Object.keys(commands)` is the one list of top-level command names, read once
into `topLevelNames` right after `commands` is built, so a new top-level
command becomes suggestible for free with no second list to maintain.
`suggestCompletion(nllc, topLevelNames, input, cursorPos)` (module-level, not
part of the closure) does the actual work: only completes when the cursor
sits at the very end of the input (mid-line completion isn't supported —
see `CodeEditor.svelte`'s overlay technique for why), and only two token
positions — the `/name` itself (`addressableNames`: every track/bus/
processor/modulator/`master`, *then* top-level commands, deliberately in that
order rather than `executeOne`'s dispatch order, so typing `/trac` suggests
an actual track like `track_1` instead of the built-in `/tracks`), or, once
past the name, a bare param *key* for whatever channel/processor/modulator it
resolves to (`resolveKeywordsFor` → `channelKeywordsFor`/
`paramObjectKeywordsFor`, each object's own `params` keys plus one of two
small hand-maintained keyword lists, `CHANNEL_ACTION_KEYWORDS`/
`PARAM_OBJECT_ACTION_KEYWORDS`, for the non-param commands like
`add_event`/`remove_self`/`help`). A token already containing `=` is
mid-value and isn't completed (value suggestions aren't built yet).
`pickBestMatch` returns the first candidate that extends the typed prefix —
no ranking or cycling among several matches yet (see
[adding-commands.md](adding-commands.md#keeping-suggestions-in-sync) for what
to update when adding a new channel/processor/modulator command).

## `nllc.js` — `NLLC`

The top-level object and factory/registry hub:

- `SYNTH_TYPES` / `PROCESSOR_TYPES` / `MODULATOR_TYPES` — the string-to-class
  registries that `synth=`/`add_processor=`/`add_modulator` command params
  (and `createSynth`/`createProcessor`/`createModulator`) look up against.
  **Adding a new synth, processor, or modulator class means adding one line
  here** (plus the import) — nothing else in the engine needs to know about it.
  `synthTypes`/`processorTypes`/`modulatorTypes` getters expose their keys
  read-only (`Object.keys(...)`) for callers outside this module — currently
  just `commands.js`'s `channelHelp`/`paramObjectHelp`, so `/track_1 help`
  can list available types without a second hardcoded copy of this list.
- `createTrack`/`createBus`/`createSynth`/`createProcessor`/`createModulator` —
  construct + register (with the clock, and with `tracks`/`buses`/
  `processors`/`modulators` for name-based lookup) in one call. `createSynth`
  also threads `this.harmony` (one shared context constructed once in the
  `NLLC` constructor, see [harmony.js](#harmonyjs)) into every synth it
  builds. Both `createTrack` and `createBus` resolve an `out=` option (default
  `"master"`) via `_resolveObject` and call `channel.connect(destObject,
  destName)` to set up the one default send a fresh track/bus starts with.
- `setTrackSynth` — swap a track's synth at runtime (used by `/track_1
  synth=sampler`), correctly deregistering the old synth from the clock and
  registering the new one.
- `removeTrack`/`removeBus`/`removeProcessor`/`removeModulator` — the inverse
  of the `create*` methods above; each first calls
  `_removePatchesReferencing(object)` *and* `_removeSendsReferencing(object)`
  (see below) *before* disconnecting any of its own nodes, then handles its
  own teardown (`removeTrack`/`removeBus` also tear down the channel's own
  processor inserts and its own sends).
- `createPatch({ sourceName, destName, depth })` / `removePatch(patch)` — the
  modular-patching layer. `_resolveObject(name)` resolves a bare name against
  every addressable object (master, then tracks, buses, processors,
  modulators — the same order `executeOne`'s dispatch uses); `_resolveDest
  ("name.param")` splits on the dot and looks up
  `object.params[paramKey].audioParam` — one lookup for every kind of object,
  since channels/processors/modulators all expose `params` as `{ key:
  NLLCParam }` uniformly (see `param.js`). `_removePatchesReferencing(object)`
  cascade-removes any patch whose `sourceObject` or `destObject` is the object
  being torn down, so a patch never outlives either endpoint.
  `_removeSendsReferencing(object)` is the same idea for sends: it walks every
  track, bus, and master and removes any send whose `destination` is the
  object being torn down, so a send never outlives the channel it fed into.
- `_uniqueName(base, existingNames)` — de-duplicates names as `base`, `base_2`,
  `base_3`, ... (used independently for tracks, buses, processors, and
  modulators — each its own namespace, so it's possible, if unlikely, for two
  different kinds of object to end up with the same addressable name).

## `ollama.js` — `Ollama`

Currently an empty stub (`{ model: "" }`) — the intended integration point for
routing natural-language input to commands (or directly manipulating the `NLLC`
graph), not yet wired to anything.
