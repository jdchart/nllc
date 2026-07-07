# LLM context: building a processor

Full tutorial with rationale: `docs/dev/creating-a-processor.md`. This is the
condensed recipe.

A processor extends `NLLCProcessor` (`src/lib/scripts/nllc-src/processor.js`),
which provides `this.input`/`this.output` (both `GainNode`s) and `this.active`
(routing bypass, handled entirely by the owning `NLLCChannel._rewireChain` —
don't check it yourself). Wire real DSP nodes between `input` and `output` in the
constructor; there's no `trigger()` or per-event method — processors just sit in
the signal chain continuously. Populate `this.params` as
`{ paramName: { get(), set(value) } }` — this is what the console's `/name
param=value` and `/name help` read/write. For any param you want usable as an
`NLLCAutomationEvent` target (ramped over time), also expose it as a getter
returning the real `AudioParam` (see `NLLCReverb.wet`/`NLLCDelay.time`).

```js
import { NLLCProcessor } from "./processor";

export class NLLCMyProcessor extends NLLCProcessor {
    constructor(audioContext, { name = "myprocessor", amount = 0.5 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "One-line description shown in /help.";

        // build DSP nodes, this.input.connect(...)....connect(this.output)
        // (existing processors always keep a dry passthrough in parallel with
        // the wet path: this.input.connect(this.output) plus a separate wet chain)

        this.params = {
            amount: {
                get: () => /* current value */ 0,
                set: (value) => { /* apply value to the DSP nodes */ },
            },
        };
    };
};
```

Register it in `nllc.js`'s `PROCESSOR_TYPES` map (`{ myprocessor: NLLCMyProcessor
}`) — the only other required change. That alone makes `/track_1
add_processor=myprocessor` and `/myprocessor amount=0.8` work, including
`remove_self` and `help`, since `processorCommand` in `commands.js` is fully
generic over `params`.
