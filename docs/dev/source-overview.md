# Source overview

All DSP/engine code lives in `src/lib/scripts/nllc-src/`. Files are listed roughly
bottom-up (dependencies first).

## `taper.js`

Pure math, no classes. `positionToGain(position)` / `gainToPosition(gain)`: an
exponential taper (`TAPER_K = 6`) between a linear 0–1 control position (fader,
`gain=` command param) and the actual 0–1 gain value, so equal position steps read
as equal loudness steps. Used by the command router (`channelCommand`) and by
`MixerChannel.svelte`'s fader — both need to convert in both directions.

## `event.js`

`NLLCEvent({ beat, pitch = 60, velocity = 1, duration = 0.25 })` — a plain data
object, one entry in a synth's `events` array. `beat` is loop-relative (0 to
`loopLengthBeats`). No behavior; synths interpret `pitch`/`velocity`/`duration`
however they like (`NLLCOscSynth` treats `pitch` as MIDI note; `NLLCSampler`
treats it as a sample-slot index).

## `automation.js`

`NLLCAutomationEvent({ beat, duration, target, from, to, curve, once })` — a
parameter ramp. `target` is a real `AudioParam` (e.g. `track.volume`,
`reverb.wet`). `scheduleAutomationEvent(time, event, secondsPerBeat)` is the
free function that actually calls the Web Audio ramp methods
(`linearRampToValueAtTime` / `exponentialRampToValueAtTime` / `setTargetAtTime`
for `curve: "target"`, an exponential approach useful for smoother/asymptotic
moves); it's called directly by `NLLCClock`, not by the owning object.

## `clock.js` — `NLLCClock`

The scheduler. See [architecture.md](architecture.md#the-clock-is-a-lookahead-scheduler-over-units)
for the full model. Key surface: `addUnit`/`removeUnit`, `start`/`stop`,
`setBpm(bpm)` (glitch-free — preserves the current playback beat across a tempo
change while running), `beatToTime(beat)`.

## `channel.js` — `NLLCChannel`

Base class for anything with a fader, pan, and an insert chain: `master` and every
`NLLCTrack` are one of these. Owns `input`/`panner`/`gainNode` nodes and the
`processors` array; `volume`/`pan` getters expose the underlying `AudioParam`s
directly (so they can be automation targets or bound straight into the UI).
`addProcessor`/`removeProcessor`/`setProcessorActive` all end by calling
`_rewireChain()`, which is the only place that actually connects/disconnects
nodes — everything else just mutates the `processors` array and lets rewiring
follow.

## `track.js` — `NLLCTrack extends NLLCChannel`

Adds exactly one thing over `NLLCChannel`: a `.source` (a synth) whose `.output`
feeds the track's `.input`. `setSource(newSource)` is how `/track_1 synth=sampler`
swaps synths at runtime without touching the track's gain/pan/inserts.

## `synth.js` — `NLLCSynth` (base)

Minimal: `name`, `output` (a `GainNode` — subclasses connect their voices into
this), `events`/`automation` arrays, `params` (empty — see
[creating-a-synth.md](creating-a-synth.md) if you want a synth with runtime
params), `active` (transport pause flag, checked by the clock, not a bypass in the
routing sense), and a no-op `trigger()` for subclasses to override.

## `oscsynth.js` — `NLLCOscSynth extends NLLCSynth`

One `OscillatorNode` + envelope `GainNode` per triggered note (see
[objects.md](../user/objects.md) for the envelope shape). Seeds itself with a
placeholder arpeggio in its constructor via `placeholderEvents()` so a fresh
instance is audible with zero authoring.

## `sampler.js` — `NLLCSampler extends NLLCSynth`

Loads `SAMPLE_FILES` (hardcoded list, from `static/samples/`) into `slots` via
`fetch` + `decodeAudioData`, URL-encoding filenames since they contain spaces.
Loading is async and **not awaited** by anything (`this._loaded` is stored but
never checked before `trigger()` — a hit that lands before its buffer finishes
loading just silently no-ops). `trigger()` mod-wraps `event.pitch` into a valid
slot index (handles negative pitches correctly, not just `%`). Also self-seeds a
placeholder pattern.

## `processor.js` — `NLLCProcessor` (base)

Mirrors `NLLCSynth`: `name`, `input`/`output` (both `GainNode`s — subclasses wire
their own DSP between them), `active` (routing bypass, read by
`Channel._rewireChain`), `params` (`{ paramName: { get(), set(value) } }` —
this *is* meant to be filled in by subclasses; it's the introspection surface the
command router uses for `/reverb wet=0.5` and `/reverb help`), `automation`.

## `reverb.js` — `NLLCReverb extends NLLCProcessor`

Convolution reverb against a synthetically-generated impulse response
(`buildImpulseResponse`: exponentially-decaying random noise per channel — no
external IR file). Parallel wet/dry: `input` connects straight to `output` (dry)
*and* to the convolver chain (wet, via `wetGain`). Exposes `wet` both as a
`params.wet` entry and as a getter returning the raw `AudioParam` (for use as an
automation `target`).

## `delay.js` — `NLLCDelay extends NLLCProcessor`

Stereo ping-pong delay: a `ChannelSplitter`/`ChannelMerger` pair around two
independent `DelayNode`s, cross-feeding each channel's output into the *other*
channel's delay line (`delayL → feedbackL → delayR`, and vice versa) rather than
back into itself, plus a small `stereoOffset` added to the right channel's delay
time for width. `time`/`feedback`/`wet` are all exposed as both `params` entries
and raw-`AudioParam` getters, same pattern as `NLLCReverb`.

## `commands.js`

No classes — a closure-based router. `parseCommand(text)` is the tokenizer
(regex-based key=value parser with quoting and optional `=` whitespace, see
[user/commands.md](../user/commands.md#syntax)); `channelCommand`/
`processorCommand` are the two shapes of object the router knows how to talk to;
`createCommandRouter(nllc)` ties it together into the single `executeCommand`
function the UI calls. See [adding-commands.md](adding-commands.md).

## `nllc.js` — `NLLC`

The top-level object and factory/registry hub:

- `SYNTH_TYPES` / `PROCESSOR_TYPES` — the string-to-class registries that
  `synth=`/`add_processor=` command params (and `createSynth`/`createProcessor`)
  look up against. **Adding a new synth or processor class means adding one line
  here** (plus the import) — nothing else in the engine needs to know about it.
- `createTrack`/`createSynth`/`createProcessor` — construct + register (with the
  clock, and with `tracks`/`processors` for name-based lookup) in one call.
- `setTrackSynth` — swap a track's synth at runtime (used by `/track_1
  synth=sampler`), correctly deregistering the old synth from the clock and
  registering the new one.
- `removeTrack`/`removeProcessor` — the inverse; also handles tearing down a
  track's own processor inserts and disconnecting Web Audio nodes so they can be
  garbage collected.
- `_uniqueName(base, existingNames)` — de-duplicates names as `base`, `base_2`,
  `base_3`, ... (used for both tracks and processors, independently).

## `ollama.js` — `Ollama`

Currently an empty stub (`{ model: "" }`) — the intended integration point for
routing natural-language input to commands (or directly manipulating the `NLLC`
graph), not yet wired to anything.
