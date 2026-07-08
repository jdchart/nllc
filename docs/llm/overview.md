# NLLC — LLM context overview

NLLC is a browser-based live-coding music environment (SvelteKit + Web Audio API).
A user types slash-commands into a console; commands create/control **tracks**
(each wrapping a **synth**), **processors** (effects, inserted into a track's or
master's chain), and the **master** bus, all playing on a shared, looping,
lookahead-scheduled **clock**. Conceptually closest to a tiny text-driven Max/MSP
or SuperCollider. Eventual goal (not yet built): the user types natural language
instead of commands, and an LLM (via `Ollama()`, currently an empty stub)
translates it into this same command vocabulary or direct graph mutations.

## Object model

```
NLLC                         top-level owner, one per page
├── audioContext             Web Audio AudioContext (suspended until /start)
├── clock: NLLCClock         lookahead scheduler; holds all "units"
├── master: NLLCChannel      final bus → audioContext.destination
├── tracks: NLLCTrack[]      extends NLLCChannel; each has .source = a synth
└── processors: NLLCProcessor[]   flat registry of every processor anywhere
```

- **`NLLCChannel`** (base of `master` and every `NLLCTrack`): fader (`volume`,
  0–1 `AudioParam`), pan (`-1..1`), an ordered insert chain of processors,
  `_rewireChain()` connects `input → active processors in order → panner →
  gainNode → destination`.
- **`NLLCSynth`** (base of `NLLCOscSynth`, `NLLCSampler`): produces sound. Has
  `events` (`NLLCEvent{beat,pitch,degree,velocity,duration}` — starts **empty**,
  populated via `add_event`), a `trigger(time, event, secondsPerBeat)` method the
  clock calls per-event, an `output` GainNode, `harmony` (the shared context, see
  below), and an `active` flag (transport pause, distinct from routing bypass).
- **`NLLCProcessor`** (base of `NLLCReverb`, `NLLCDelay`): effects. Has
  `input`/`output` GainNodes, a `params` object (`{name: {get(),set(value)}}`) as
  its console-facing control surface, and `active` as a *routing bypass* (handled
  by the owning channel, not the processor itself).
- **`NLLCClock`**: `setTimeout`-based lookahead scheduler (25ms lookahead, 100ms
  schedule-ahead window), loops every `loopLengthBeats` (default 4) beats — both
  `bpm` and `loopLengthBeats` are runtime-mutable (`/clock bpm= num_beats=`).
  Treats synths, channels, and processors uniformly as "units" — anything with
  `events`/`automation`/`trigger()`/`active`. Also exposes `nextBeatTime()`/
  `nextCycleTime()`, the anchors for deferred console ramps (see below).
- **`NLLCAutomationEvent`**: a parameter ramp targeting a real `AudioParam`
  (`from → to` over `duration` beats, `curve: linear|exponential|target`, `once`
  for non-repeating ramps like a fade-in), matched against loop-relative beat
  position by the clock. Distinct from a **console ramp** (`/track_1 gain=0 3`),
  which is a one-off `scheduleRamp()` call anchored to an absolute time
  (immediate by default, or the next beat/cycle with `at=beat`/`at=cycle`) and
  never touches a unit's `.automation` array — see `automation.js`.
- **Harmony context** (`nllc.harmony`, from `harmony.js`): one shared
  `{ root, scale }` object threaded into every synth. `NLLCEvent.degree` is
  resolved against it *at trigger time* (not when authored), so changing the
  context retunes already-scheduled patterns live. `scale` defaults to
  chromatic (degree ≈ semitone offset) — real scale/chord logic and a runtime
  command to change it are not built yet, only the hook.

## Type registries (extend here, nowhere else, for new types)

`src/lib/scripts/nllc-src/nllc.js`:
```js
const SYNTH_TYPES = { oscsynth: NLLCOscSynth, sampler: NLLCSampler };
const PROCESSOR_TYPES = { reverb: NLLCReverb, delay: NLLCDelay };
```

## Command surface (full detail: `docs/user/commands.md`)

`/name key=val ...` where `name` is a top-level command (`start`, `stop`,
`add_track`, `tracks`, `clock`), `master`, a track's name, or a processor's
name. Channels support `gain=`, `pan=`, `add_event`, `clear_events`, `start`,
`stop`, `synth=`, `add_processor=`, `remove_processor=`, `remove_self`.
Processors support their own `params` keys plus `remove_self`, and
`help`/no-args to introspect.

`gain=`/`pan=`/any processor param accept a trailing duration to ramp instead
of setting instantly: `gain=0 3` (3 seconds) or `gain=0 4b` (4 beats). Add
`at=beat`/`at=cycle` to defer the ramp's start to the next beat/loop boundary
instead of firing immediately (default). Several `/name ...` commands can be
typed on one submitted line and they all dispatch together, e.g.
`/track_1 gain=0 8 /reverb wet=0.9 6b`.

## Interface

`src/routes/code-editor/+page.svelte` owns the single `NLLC` instance (created
client-side only, in `onMount`, since `AudioContext` needs a browser) and the
`executeCommand` function from `createCommandRouter(nllc)`. `CodeEditor.svelte` is
the text console; `Mixer.svelte`/`MixerChannel.svelte`/`Transport.svelte` are a
polled, read/write view onto the same live audio-graph objects (fader ↔
`channel.gainNode.gain`, pan dial ↔ `channel.pan`, etc.) — console and mixer are
two UIs on one shared state, not separate stores.

## Known current limitations (don't assume otherwise)

- `Ollama()` (`ollama.js`) is an empty stub — no NL-to-command wiring exists yet.
- Event authoring is manual only (`add_event`/`clear_events`, one event per
  command) — no algorithmic/pattern-generator commands (euclidean rhythms,
  step-string parsers, etc.) and no per-cycle/every-N-cycle regeneration hook
  exist yet, though the clock's uniform "unit" contract would be the natural
  place to add one (an optional `onCycle(cycleIndex)` called at loop
  boundaries) if/when that's built.
- The harmony context (`nllc.harmony`) is a passthrough hook, not a real
  scale/chord system — `scale` defaults to chromatic, and there's no
  `/harmony` command yet to change `root`/`scale` at runtime.
- Synth-level runtime params (e.g. `NLLCOscSynth.waveform`) are not exposed
  through `channelCommand` the way processor params are — only settable via
  `/add_track synth=... waveform=...` at creation time.
- `NLLCSampler` sample loading is unawaited fire-and-forget; a trigger before load
  completes silently no-ops.
- `splitCommands` (multi-command-per-line) assumes no param value contains a
  literal `/`; none currently do, but a value that did would be mis-split.

## Detailed docs

- `docs/user/` — tutorial, full command reference, synth/processor reference.
- `docs/dev/` — architecture, file-by-file source walkthrough, tutorials for
  adding a synth/processor/command.
- `docs/llm/building-synths.md`, `building-processors.md`, `adding-commands.md` —
  condensed, code-skeleton versions of the `docs/dev` tutorials for use as LLM
  context when the task is specifically "add a new X".
