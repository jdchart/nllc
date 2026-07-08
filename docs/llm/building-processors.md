# LLM context: building a processor

Full tutorial with rationale: `docs/dev/creating-a-processor.md`. This is the
condensed recipe.

A processor extends `NLLCProcessor` (`src/lib/scripts/nllc-src/processor.js`),
which provides `this.input`/`this.output` (both `GainNode`s) and `this.active`
(routing bypass, handled entirely by the owning `NLLCChannel._rewireChain` —
don't check it yourself). Wire real DSP nodes between `input` and `output` in the
constructor; there's no `trigger()` or per-event method — processors just sit in
the signal chain continuously. Populate `this.params` as `{ paramName: NLLCParam }`
(`src/lib/scripts/nllc-src/param.js`) — this is what the console's `/name
param=value`, `/name help`, ramping, and `at=` deferral all read/write generically
via `commands.js`'s `applyParams()`.

```js
import { NLLCProcessor } from "./processor";
import { NLLCParam } from "./param";

export class NLLCMyProcessor extends NLLCProcessor {
    constructor(audioContext, { name = "myprocessor", amount = 0.5 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "One-line description shown in /help.";

        // build DSP nodes, this.input.connect(...)....connect(this.output)
        // (existing processors always keep a dry passthrough in parallel with
        // the wet path: this.input.connect(this.output) plus a separate wet chain)
        this.someGain = audioContext.createGain();
        this.someGain.gain.value = amount;

        this.params = {
            amount: new NLLCParam(this.someGain.gain),
        };
    };

    // Optional: only add if you want `amount` usable directly as an
    // NLLCAutomationEvent target elsewhere — a thin delegate, not a second
    // implementation, so it can't drift from params.amount.
    get amount() {
        return this.params.amount.audioParam;
    };
};
```

`new NLLCParam(audioParam, opts?)` covers almost every case:
- Single real `AudioParam` (most common): `new NLLCParam(this.someGain.gain)`.
- Needs a value transform (rare outside channel gain's taper): `{ decode, encode }`.
- Needs clamping: `{ min, max }`.
- Needs to fan one value out across more than one node (e.g. `NLLCDelay.time`
  writing both delayL/delayR): `{ onSet: (value) => { /* write to both */ } }`
  — pass whichever node is "primary" as the constructor's `audioParam` (that's
  what ramping/deferred `at=` animates); `onSet` only overrides the plain
  instant-set path.
- Not backed by any real `AudioParam` at all (e.g. a value that rebuilds a
  waveshaper curve): don't force it into `NLLCParam` — leave it as a
  constructor-only option instead.

Register it in `nllc.js`'s `PROCESSOR_TYPES` map (`{ myprocessor: NLLCMyProcessor
}`) — the only other required change. That alone makes `/track_1
add_processor=myprocessor` and `/myprocessor amount=0.8` work, including
`remove_self`, `help`, ramping (`/myprocessor amount=0.8 3`), and `at=beat`/
`at=cycle` deferral — no extra code needed beyond the `NLLCParam`.
