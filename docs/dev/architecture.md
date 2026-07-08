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
    └── MixerChannel.svelte        one per track, plus one for master
```

`code-editor/+page.svelte` is the only place the `NLLC` instance and its
`createCommandRouter`-produced `executeCommand` function live; they're passed down
as props. It also owns a `requestAnimationFrame` poll loop that diffs
`nllc.tracks.map(t => t.name).join(",")` to detect additions/removals — `nllc.tracks`
is a plain mutable array, not Svelte state, since it's mutated from inside the
DSP layer (`NLLC.createTrack`/`removeTrack`), not from component code.
`MixerChannel.svelte` does the same trick for a channel's `processors` list.

Everything below `code-editor/+page.svelte` reads live values off the `NLLC`
object's real Web Audio nodes directly (`channel.gainNode.gain.value`,
`channel.pan.value`, an `AnalyserNode` tapped onto `gainNode` for the meter) rather
than through a duplicated reactive store — the DOM is a thin, polled view onto the
audio graph, and the console (`executeCommand`) is another view onto the exact same
graph. Neither is a source of truth; the `NLLC` instance's nodes are.

## DSP object graph

```
NLLC
├── audioContext            (suspended until /start)
├── clock: NLLCClock        drives every registered "unit"
├── master: NLLCChannel     final bus → audioContext.destination
├── tracks: NLLCTrack[]     extends NLLCChannel, each wraps one .source (a synth)
└── processors: NLLCProcessor[]   flat list of every processor that exists anywhere,
                                   for name/id lookup + removal; ownership/insertion
                                   order lives on the owning Channel, not here
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
`{ events?, automation?, trigger(time, event, secondsPerBeat), active? }`. Both
synths *and* channels (tracks/master) *and* processors get registered as units:

- A synth's `events` are note-like `NLLCEvent`s; its `trigger()` makes sound.
- A channel's or processor's `automation` is `NLLCAutomationEvent`s (parameter
  ramps, e.g. a fade-in on `track.volume` or an opening reverb `wet`); channels and
  processors don't implement `trigger()` themselves — the clock schedules their
  automation directly via `scheduleAutomationEvent()`, keyed off the same
  `unit.automation` array shape.

`NLLC.createTrack` registers **two** units for one track: the synth (`source`) and
the `NLLCTrack` itself, because they have independent `events`/`automation` lists
(a synth's notes vs. the track's own volume/pan automation).

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

Both `bpm` and `loopLengthBeats` are runtime-mutable (`setBpm` — glitch-free,
rebases `startTime` so the current playback beat doesn't jump — and
`setLoopLengthBeats`, exposed via `/clock bpm= num_beats=`). `_scheduleRange`
reads both fresh every tick, so a change takes effect on the next tick;
changing `loopLengthBeats` mid-loop can shift where the current loop boundary
falls, an accepted live-coding wrinkle rather than a bug. The clock also
exposes `currentBeat()`, `nextBeatTime()`, and `nextCycleTime()` — the anchor
points console ramps use to defer their start (see below) rather than firing
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
  curve })` — called directly by the command router, **not** registered with
  the clock at all. This is the vehicle for console ramps (`/track_1 gain=0
  3`, `/reverb wet=0.9 6b at=beat`): a one-off side effect anchored to an
  absolute `AudioContext` time (`audioContext.currentTime` by default, or
  `clock.nextBeatTime()`/`nextCycleTime()` when `at=beat`/`at=cycle` is given)
  rather than a loop-relative pattern position. The two paths are kept
  separate deliberately — "ramp starting right now" has no natural
  loop-relative beat to attach to, and forcing it through the clock's
  per-tick loop-position matching would add complexity (computing a live
  "current beat", handling the engine-not-started case) for no benefit.

## Command router as a third view

`createCommandRouter(nllc)` closes over the live `NLLC` instance and returns a
single `executeCommand(text)` function — it does not maintain any state of its
own. Dispatch is by name lookup against `nllc.tracks`/`nllc.processors`/`master` at
call time, so newly created tracks/processors are addressable immediately with no
registration step beyond what `NLLC.createTrack`/`createProcessor` already do. See
[adding-commands.md](adding-commands.md) for extending it.

## Why this shape

The base classes (`NLLCSynth`, `NLLCProcessor`, `NLLCChannel`) are intentionally
thin — closer to interfaces than frameworks — so a new synth or processor subclass
only needs to wire its own Web Audio nodes between `this.input`/`this.output` (or
just define `this.output` for a synth) and implement the one or two methods the
clock/router actually call. See [source-overview.md](source-overview.md) for a
file-by-file tour and [creating-a-synth.md](creating-a-synth.md) /
[creating-a-processor.md](creating-a-processor.md) for tutorials.
