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
  `events` (`NLLCEvent{beat,pitch,velocity,duration}`), a `trigger(time, event,
  secondsPerBeat)` method the clock calls per-event, an `output` GainNode, and an
  `active` flag (transport pause, distinct from routing bypass).
- **`NLLCProcessor`** (base of `NLLCReverb`, `NLLCDelay`): effects. Has
  `input`/`output` GainNodes, a `params` object (`{name: {get(),set(value)}}`) as
  its console-facing control surface, and `active` as a *routing bypass* (handled
  by the owning channel, not the processor itself).
- **`NLLCClock`**: `setTimeout`-based lookahead scheduler (25ms lookahead, 100ms
  schedule-ahead window), loops every `loopLengthBeats` (default 4) beats. Treats
  synths, channels, and processors uniformly as "units" — anything with
  `events`/`automation`/`trigger()`/`active`.
- **`NLLCAutomationEvent`**: a parameter ramp targeting a real `AudioParam`
  (`from → to` over `duration` beats, `curve: linear|exponential|target`, `once`
  for non-repeating ramps like a fade-in).

## Type registries (extend here, nowhere else, for new types)

`src/lib/scripts/nllc-src/nllc.js`:
```js
const SYNTH_TYPES = { oscsynth: NLLCOscSynth, sampler: NLLCSampler };
const PROCESSOR_TYPES = { reverb: NLLCReverb, delay: NLLCDelay };
```

## Command surface (full detail: `docs/user/commands.md`)

`/name key=val ...` where `name` is a top-level command (`start`, `stop`,
`add_track`, `tracks`), `master`, a track's name, or a processor's name.
Channels support `gain=`, `pan=`, `start`, `stop`, `synth=`, `add_processor=`,
`remove_processor=`, `remove_self`. Processors support their own `params` keys
plus `remove_self`, and `help`/no-args to introspect.

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
- No real event-authoring UI/command — synths only ever play a hardcoded
  placeholder pattern seeded in their own constructor.
- Synth-level runtime params (e.g. `NLLCOscSynth.waveform`) are not exposed
  through `channelCommand` the way processor params are — only settable via
  `/add_track synth=... waveform=...` at creation time.
- `NLLCSampler` sample loading is unawaited fire-and-forget; a trigger before load
  completes silently no-ops.

## Detailed docs

- `docs/user/` — tutorial, full command reference, synth/processor reference.
- `docs/dev/` — architecture, file-by-file source walkthrough, tutorials for
  adding a synth/processor/command.
- `docs/llm/building-synths.md`, `building-processors.md`, `adding-commands.md` —
  condensed, code-skeleton versions of the `docs/dev` tutorials for use as LLM
  context when the task is specifically "add a new X".
