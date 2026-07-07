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
