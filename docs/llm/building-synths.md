# LLM context: building a synth

Full tutorial with rationale: `docs/dev/creating-a-synth.md`. This is the
condensed recipe.

A synth extends `NLLCSynth` (`src/lib/scripts/nllc-src/synth.js`), which provides
`this.output` (a `GainNode`), `this.events`/`this.automation` arrays, `this.active`,
and `addEvent()`/`addAutomation()`. Implement `trigger(time, event,
secondsPerBeat)`: build fresh Web Audio nodes (oscillator/buffer source/etc.),
schedule them starting at the given `time` (an absolute `AudioContext` timestamp,
not `currentTime`), connect the chain's end into `this.output`, and `start()`/
`stop()` the source node(s). `event.duration` is in beats — multiply by
`secondsPerBeat` for seconds. Nodes like `OscillatorNode` are one-shot; build them
inside `trigger()`, don't try to reuse a persistent node across triggers.

```js
import { NLLCSynth } from "./synth";
import { resolveDegree } from "./harmony"; // only if pitch means "MIDI note"

export class NLLCMySynth extends NLLCSynth {
    constructor(audioContext, { name = "mysynth" } = {}) {
        super(audioContext, { name });
        this.llm_summary = "One-line description shown in /track_1 summaries.";
        // don't seed placeholder events — leave this.events empty; the
        // console/UI/LLM populates it via add_event
    };

    trigger(time, event, secondsPerBeat) {
        const ctx = this.audioContext;
        const durationSeconds = event.duration * secondsPerBeat;
        const midi = event.degree !== undefined ? resolveDegree(this.harmony, event.degree) : event.pitch;
        // build nodes, schedule at `time`, ramp gain to ~0.0001 exponentially
        // by time + durationSeconds to avoid clicks, connect(...).connect(this.output)
    };
};
```

Register it in `nllc.js`'s `SYNTH_TYPES` map (`{ mysynth: NLLCMySynth }`) — the
only other required change. That alone makes `/add_track synth=mysynth` and
`/track_1 synth=mysynth` work.

Leave `this.events` empty in the constructor — a fresh instance being silent
until `add_event` is called is expected, not a bug to work around. If `pitch`
means "MIDI note" for your synth, resolve `event.degree` via `this.harmony`
(set automatically by the base class) as shown above so it benefits from any
future key/scale-changing command; skip this if `pitch` means something else
(e.g. a sample-slot index, like `NLLCSampler`). Optional: populate
`this.params` (`{name: {get(),set(value)}}`) for runtime-adjustable synth
params — note the command router doesn't currently read `channel.source.params`
(only `processor.params`), so this would need a small `commands.js` addition
to be reachable from the console today.
