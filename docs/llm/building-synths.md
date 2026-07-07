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

export class NLLCMySynth extends NLLCSynth {
    constructor(audioContext, { name = "mysynth" } = {}) {
        super(audioContext, { name });
        this.llm_summary = "One-line description shown in /track_1 summaries.";
        // optional: for (const e of placeholderEvents()) this.addEvent(e);
    };

    trigger(time, event, secondsPerBeat) {
        const ctx = this.audioContext;
        const durationSeconds = event.duration * secondsPerBeat;
        // build nodes, schedule at `time`, ramp gain to ~0.0001 exponentially
        // by time + durationSeconds to avoid clicks, connect(...).connect(this.output)
    };
};
```

Register it in `nllc.js`'s `SYNTH_TYPES` map (`{ mysynth: NLLCMySynth }`) — the
only other required change. That alone makes `/add_track synth=mysynth` and
`/track_1 synth=mysynth` work.

Optional: seed `this.addEvent(...)` calls in the constructor so a fresh instance
is audible immediately (both existing synths do this — there's no event-authoring
UI yet). Optional: populate `this.params` (`{name: {get(),set(value)}}`) for
runtime-adjustable synth params — note the command router doesn't currently read
`channel.source.params` (only `processor.params`), so this would need a small
`commands.js` addition to be reachable from the console today.
