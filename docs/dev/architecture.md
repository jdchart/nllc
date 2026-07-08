# Architecture

NLLC has two halves that meet at a single object: a plain-JS DSP/scheduling engine
(`src/lib/scripts/nllc-src/`) and a Svelte interface (`src/routes`,
`src/lib/components`) that renders and drives it. There is exactly one `NLLC`
instance per page, created client-side (it touches `AudioContext`, which doesn't
exist during SSR).

## Interface tree

```
routes/+layout.svelte              theme.css / reset.css, favicon — global chrome only
routes/+page.svelte                just a link to /code-editor
routes/code-editor/+page.svelte    owns the NLLC instance + executeCommand; top-level layout
├── CodeEditor.svelte              text input + scrollback log; calls onCommand(text) prop
└── Mixer.svelte  /  CollapsedRail.svelte    (toggled by a collapse arrow)
    ├── Transport.svelte           engine on/off, clock LED, beat/bpm readout
    ├── MixerChannel.svelte        one per track, plus one for master (Tracks section)
    ├── ModulatorStrip.svelte      one per modulator (Modulators section)
    └── PatchList.svelte           every active patch cable, as a flat list
```

`code-editor/+page.svelte` is the only place the `NLLC` instance and its
`createCommandRouter`-produced `executeCommand` function live; they're passed down
as props. It also owns a `requestAnimationFrame` poll loop that diffs each of
`nllc.tracks`, `nllc.modulators`, and `nllc.patches` (by `.name`/`.name`/`.id`
respectively, joined into a string) to detect additions/removals — these are
plain mutable arrays, not Svelte state, since they're mutated from inside the
DSP layer (`NLLC.createTrack`/`removeTrack`/`createModulator`/etc.), not from
component code. `MixerChannel.svelte` does the same trick for a channel's
`processors` list.

Everything below `code-editor/+page.svelte` reads live values off the `NLLC`
object's real Web Audio nodes directly (`channel.gainNode.gain.value`,
`channel.pan.value`, an `AnalyserNode` tapped onto `gainNode`/a modulator's
`output` for a meter) rather than through a duplicated reactive store — the DOM
is a thin, polled view onto the audio graph, and the console (`executeCommand`)
is another view onto the exact same graph. Neither is a source of truth; the
`NLLC` instance's nodes are. Both `MixerChannel.svelte` and
`ModulatorStrip.svelte` take care to wrap their `AnalyserNode`-tap cleanup in a
`try { ... } catch {}` — if the track/modulator was removed from the console
while the strip was still mounted, `nllc.removeTrack`/`removeModulator` already
did a blanket `.disconnect()` that silently takes the tap connection down with
it, so the specific `.disconnect(analyser)` in the component's own cleanup
would otherwise throw on an already-severed connection.

## DSP object graph

```
NLLC
├── audioContext            (suspended until /start)
├── clock: NLLCClock        drives every registered "unit"
├── master: NLLCChannel     final bus → audioContext.destination
├── tracks: NLLCTrack[]     extends NLLCChannel, each wraps one .source (a synth)
├── processors: NLLCProcessor[]   flat list of every processor that exists anywhere,
│                                  for name/id lookup + removal; ownership/insertion
│                                  order lives on the owning Channel, not here
├── modulators: NLLCModulator[]   flat list of every modulator (e.g. an lfo) —
│                                  named/addressable like a processor, but never
│                                  joins a channel's chain; exists to be patched
└── patches: NLLCPatch[]    every active "patch cable" (source.output → depth → destParam)
```

### Signal chain (per `NLLCChannel` — master or a track)

```
input ──▶ [processors[0].input → .output] ──▶ [processors[1] ...] ──▶ panner ──▶ gainNode ──▶ (destination)
```

`_rewireChain()` rebuilds this every time a processor is added/removed/bypassed,
skipping any processor with `active === false` (a true routing bypass — the node is
disconnected, not just silenced). A track's `input` is fed by its synth's `output`
(`NLLCTrack` wires `source.output → this.input` in its constructor and in
`setSource()`); a track's `gainNode` connects to `master.input`; master's
`gainNode` connects to `audioContext.destination`.

### One param abstraction for everything rampable/patchable

`NLLCParam` (`param.js`) wraps a single raw `AudioParam`, with optional
value-transform (`decode`/`encode`, used by channel `gain`'s exponential
taper), `min`/`max` clamping, and an `onSet` override for a param that has to
fan a single value out across more than one node (`NLLCDelay`'s `time`/
`feedback`). Every kind of object with rampable params — `NLLCChannel`
(`gain`/`pan`), `NLLCProcessor` subclasses, `NLLCModulator` subclasses, and
`NLLCPatch` (`depth`) — exposes them as `this.params = { key: NLLCParam }`.
`commands.js`'s `applyParams()` is the single function that knows how to
get/set/ramp/defer *any* of them, used identically regardless of which kind
of object owns the param.

This matters because before `NLLCParam` existed, a param's console-facing
`{get,set}` closure and the separately-declared same-named raw-`AudioParam`
getter that ramping code reached into (e.g. `get wet()`) were two independent
things a class author had to keep in sync by hand — easy to add one and
forget the other. `NLLCParam` is the single source of truth for both; a class
that still exposes a getter like `get wet()` (for use as an
`NLLCAutomationEvent` target elsewhere in the codebase) does so as a thin
delegate onto `this.params.wet.audioParam`, not a second implementation.

### Modular patching

`NLLCModulator` (`modulator.js`, e.g. `NLLCLFO`) is structurally a processor's
sibling — named/addressable, exposes `params` the same way — but never sits
in a channel's insert chain; it exists purely to be *patched* into some other
object's parameter. `NLLCPatch` (`patch.js`) is the "cable": it connects a
source object's raw `.output` (a modulator, but also a track/master's
post-fader signal, or a processor's post-effect signal — anything with an
`.output`) into a destination `AudioParam`, through its own `depthGain`
(attenuator) node — `source.output → depthGain → destParam`. This is a
direct application of a native Web Audio feature: connecting any `AudioNode`'s
output straight into an `AudioParam` **adds** to whatever value is already
scheduled there via the normal `setValueAtTime`/ramp machinery, so a patched
modulator and a console ramp on the same param don't fight each other — the
modulator just wobbles on top of whatever the base value currently is.

Depth lives on the *patch*, not either endpoint — deliberately, so the same
modulator can drive several destinations at different depths (a real
patch-cable-plus-attenuator model), and removing one patch (`NLLC.removePatch`)
never touches either endpoint directly, just the one cable. `NLLC` tracks
`sourceObject`/`destObject` on every patch specifically so
`removeTrack`/`removeProcessor`/`removeModulator` can cascade-remove any patch
referencing the object being torn down (`_removePatchesReferencing`) — this
must run *before* the object's own node teardown, since a patch's own
`disconnect()` uses a specific-argument `.disconnect(node)` call that throws
if that exact connection was already severed by a blanket `.disconnect()`
first.

Deliberately out of scope so far (see `ideas.md`/session notes rather than
code): a modulator or patch that generates *events* rather than a continuous
control signal (for algorithmic melody/rhythm) — building that would need an
"event input" concept on `NLLCSynth` alongside its manually-authored `events`
array, which hasn't been designed yet.

### Harmony context

`NLLC.harmony` (`{ root, scale }`, from `harmony.js`) is one shared object
constructed once in the `NLLC` constructor and threaded into every synth via
`createSynth`'s `{ ...options, harmony: this.harmony }`. An `NLLCEvent` can
carry `degree` instead of (or alongside) `pitch`; a pitched synth (`oscsynth`)
resolves `degree` against `this.harmony` inside `trigger()` — i.e. at the
moment the note actually sounds, not when the event was authored. This is
deliberate: since every synth holds a *reference* to the same context object,
mutating its fields in place (once a `/harmony` command exists to do so) would
retune every pattern using `degree`, live, without touching a single event.
Today `scale` defaults to chromatic (`[0..11]`), so `degree` behaves as a
plain semitone offset — the hook is built, but real scale/chord logic and the
runtime command to change key are deliberately deferred.

### The clock is a lookahead scheduler over "units"

`NLLCClock.units` is a flat, undifferentiated array of anything with the shape
`{ events?, automation?, trigger(time, event, secondsPerBeat), active? }`. Synths,
channels (tracks/master), processors, *and* modulators all get registered as units:

- A synth's `events` are note-like `NLLCEvent`s; its `trigger()` makes sound.
- A channel's or processor's `automation` is `NLLCAutomationEvent`s (parameter
  ramps, e.g. a fade-in on `track.volume` or an opening reverb `wet`); these
  (and modulators, which register but currently have no `events`/`automation`
  of their own — see below) don't implement `trigger()` themselves — the clock
  schedules automation directly via `scheduleAutomationEvent()`, keyed off the
  same `unit.automation` array shape.

`NLLC.createTrack` registers **two** units for one track: the synth (`source`) and
the `NLLCTrack` itself, because they have independent `events`/`automation` lists
(a synth's notes vs. the track's own volume/pan automation). A modulator
registers as one unit (mainly so a future loop-position pattern automation on
its own params, e.g. an LFO's `freq` sweeping over a pattern, would work for
free via the same `unit.automation` mechanism — nothing currently populates
that for a modulator).

Scheduling runs via `setTimeout`, not `requestAnimationFrame` (so it keeps ticking
in a background tab): every `lookaheadMs` (25ms) it looks `scheduleAheadTime`
(0.1s) into the future, converts that window to a beat range, and schedules any
event/automation whose `.beat` falls in range using precise `AudioContext` time
(`beatToTime`). The whole pattern repeats every `loopLengthBeats` (default 4)
beats — `_scheduleRange` handles a lookahead window that straddles a loop boundary
by iterating loop indices, not just beat numbers. `NLLCAutomationEvent.once` events
(e.g. a one-time fade-in) are marked `_scheduled` after firing so they don't replay
on subsequent loops. `unit.active === false` (a track paused via `/track_1 stop`, or
a bypassed processor) makes the clock skip that unit's events *and* automation
entirely for that tick.

`_tick()` wraps its call to `_scheduleRange` in a try/catch, so a single bad
event/param (something that throws inside a native `AudioParam` call, e.g. a
non-finite value that slipped through) can only drop that one scheduling pass
— the reschedule (`setTimeout(() => this._tick(), ...)`) runs unconditionally
right after, so the whole engine going permanently silent from one bad command
is never possible. `commands.js`'s `toNumber()` is the first line of defense
(reject bad input before it's ever applied); this is the second, structural
one.

Both `bpm` and `loopLengthBeats` are runtime-mutable. `setBpm` is glitch-free —
it rebases `startTime` so the current playback beat doesn't jump — and also
cancels any in-flight `rampBpm`. `rampBpm(targetBpm, durationSeconds,
{startTime})` glides tempo over time; since bpm isn't a native `AudioParam`
(it's a plain number the clock uses for its own beat↔time math), this can't
ride `linearRampToValueAtTime` the way a channel/processor param can — instead
it steps `_applyBpm` repeatedly on a short `setTimeout`, each step
re-deriving `startTime` the same glitch-free way `setBpm` always has.
`setLoopLengthBeats` has no ramp equivalent by design (a fractional,
constantly-shifting loop length has no sensible meaning) — both are exposed
via `/clock bpm= num_beats=`. `_scheduleRange` reads both fresh every tick, so
a change takes effect on the next tick; changing `loopLengthBeats` mid-loop
can shift where the current loop boundary falls, an accepted live-coding
wrinkle rather than a bug. The clock also exposes `currentBeat()`,
`nextBeatTime()`, and `nextCycleTime()` — the anchor points a console ramp or
a deferred instant set uses to defer its start (see below) rather than firing
immediately.

### Two ramp-scheduling paths, one curve implementation

`automation.js` has a private `applyRamp(param, time, endTime, from, to, curve)`
that is the only place that turns a curve name into actual `AudioParam` calls
(`linearRampToValueAtTime`/`exponentialRampToValueAtTime`/`setTargetAtTime`).
Two exported functions call into it for two different use cases:

- `scheduleAutomationEvent(time, event, secondsPerBeat)` — the clock calls this
  directly for `NLLCAutomationEvent`s sitting in a unit's `.automation` array,
  matched against loop-relative beat position the same way `events` are.
- `scheduleRamp(audioContext, param, from, to, durationSeconds, { startTime,
  curve })` — called by `commands.js`'s `applyParams()`, **not** registered
  with the clock at all. This is the vehicle for console ramps (`/track_1
  gain=0 3`, `/reverb wet=0.9 6b at=beat`): a one-off side effect anchored to
  an absolute `AudioContext` time (`audioContext.currentTime` by default, or
  `clock.nextBeatTime()`/`nextCycleTime()` when `at=beat`/`at=cycle` is given)
  rather than a loop-relative pattern position. The two paths are kept
  separate deliberately — "ramp starting right now" has no natural
  loop-relative beat to attach to, and forcing it through the clock's
  per-tick loop-position matching would add complexity (computing a live
  "current beat", handling the engine-not-started case) for no benefit.

A plain (non-ramped) instant set given `at=beat`/`at=cycle` uses
`commands.js`'s `setInstant()` instead — `cancelScheduledValues` +
`setValueAtTime` at the resolved future time, rather than a direct `.value =`
assignment — so "jump to this value on the next beat" is possible without
needing a ramp duration at all.

## Command router as a third view

`createCommandRouter(nllc)` closes over the live `NLLC` instance and returns a
single `executeCommand(text)` function — it does not maintain any state of its
own. Dispatch is by name lookup against `nllc.tracks`/`nllc.processors`/
`nllc.modulators`/`master` at call time, so newly created tracks/processors/
modulators are addressable immediately with no registration step beyond what
`NLLC.createTrack`/`createProcessor`/`createModulator` already do. See
[adding-commands.md](adding-commands.md) for extending it.

## Why this shape

The base classes (`NLLCSynth`, `NLLCProcessor`, `NLLCModulator`, `NLLCChannel`) are
intentionally thin — closer to interfaces than frameworks — so a new synth,
processor, or modulator subclass only needs to wire its own Web Audio nodes
between `this.input`/`this.output` (or just define `this.output` for a synth
or modulator) and implement the one or two methods the clock/router actually
call. See [source-overview.md](source-overview.md) for a file-by-file tour and
[creating-a-synth.md](creating-a-synth.md) / [creating-a-processor.md](creating-a-processor.md)
/ [creating-a-modulator.md](creating-a-modulator.md) for tutorials.
