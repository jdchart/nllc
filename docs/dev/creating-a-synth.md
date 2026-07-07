# Creating a synth

A synth is anything that extends `NLLCSynth`, implements `trigger()`, and connects
its sound-producing nodes into `this.output` (a `GainNode` the base class already
creates for you).

## Minimal example

A one-oscillator sine "ping" synth, ignoring `pitch`/`velocity` for simplicity:

```js
// src/lib/scripts/nllc-src/pingsynth.js
import { NLLCSynth } from "./synth";

export class NLLCPingSynth extends NLLCSynth {
    constructor(audioContext, { name = "pingsynth" } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A single sine-wave ping per event, fixed pitch.";
    };

    trigger(time, event, secondsPerBeat) {
        const ctx = this.audioContext;
        const durationSeconds = event.duration * secondsPerBeat;

        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(440, time);

        const voiceGain = ctx.createGain();
        voiceGain.gain.setValueAtTime(event.velocity, time);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds);

        osc.connect(voiceGain).connect(this.output);
        osc.start(time);
        osc.stop(time + durationSeconds + 0.05);
    };
};
```

Points worth noting, all copied from `oscsynth.js`/`sampler.js`:

- **Always create fresh nodes per trigger.** `OscillatorNode`/`AudioBufferSourceNode`
  are one-shot (`start()` can only be called once) — you cannot reuse a single
  persistent oscillator across triggers the way a real modular synth voice might;
  build the voice graph inside `trigger()` and let it be garbage-collected after
  `stop()`.
- **Schedule at `time`, not `audioContext.currentTime`.** The clock computed `time`
  as a precise future `AudioContext` timestamp via lookahead scheduling; using
  `currentTime` instead would make playback jittery.
- **`secondsPerBeat` converts `event.duration` (in beats) to seconds** — durations
  in `NLLCEvent` are tempo-relative, not absolute.
- **Ramp gain to 0 exponentially, not linearly, and add a small tail** (`+ 0.05`
  on `stop()`) so the oscillator doesn't hard-cut mid-sample (a click).
  `exponentialRampToValueAtTime` cannot target exactly `0`, hence `0.0001`.
- **`this.output` is provided by the base class** — never create your own output
  gain node; connect your voice's final node into the inherited one.

## Registering it

Add it to the registry in `nllc.js` (the only place that needs to know new synth
types exist):

```js
import { NLLCPingSynth } from "./pingsynth";

const SYNTH_TYPES = {
    oscsynth: NLLCOscSynth,
    sampler: NLLCSampler,
    pingsynth: NLLCPingSynth,   // add this
};
```

That's it — `/add_track synth=pingsynth` and `/track_1 synth=pingsynth` both work
immediately, with no other code changes, because `createTrack`/`setTrackSynth`
look the type up in `SYNTH_TYPES` dynamically.

## Optional: self-seeding placeholder events

Both existing synths add a few `NLLCEvent`s in their own constructor
(`this.addEvent(...)`) so a freshly-created instance is audible without any
event-authoring UI existing yet. This is a convention, not a requirement of the
base class — but until real event authoring exists (see the open questions in the
last session summary / `ideas.md`), a new synth with no seeded events will be
silent until something else pushes events onto it.

## Optional: runtime params

`NLLCSynth.params` starts as `{}` and neither existing synth subclass overrides it
— today, synth-level configuration (like `NLLCOscSynth`'s `waveform`) is only
settable via constructor options, reachable through `/add_track synth=oscsynth
waveform=square` (not through `/track_1 synth=...`, which only forwards the type —
see [user/commands.md](../user/commands.md)). If you want a synth parameter
adjustable at runtime the same way `NLLCReverb`'s `wet` is, follow the processor
pattern in [creating-a-processor.md](creating-a-processor.md#exposing-params) and
populate `this.params` the same way; `channelCommand` in `commands.js` would need
a small addition to actually read `channel.source.params` the way
`processorCommand` reads `processor.params` — it doesn't today.
