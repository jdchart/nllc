# Creating a processor

A processor is anything that extends `NLLCProcessor`, wires real DSP nodes between
the inherited `this.input` and `this.output` (both plain `GainNode`s), and
populates `this.params` so the console can inspect/control it.

## Minimal example

A simple hard-clip distortion using a `WaveShaperNode`, with one runtime param
(`amount`):

```js
// src/lib/scripts/nllc-src/distortion.js
import { NLLCProcessor } from "./processor";

function buildCurve(amount) {
    const samples = 1024;
    const curve = new Float32Array(samples);
    const k = amount * 100;
    for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * 2 - 1;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
};

export class NLLCDistortion extends NLLCProcessor {
    constructor(audioContext, { name = "distortion", amount = 0.5, wet = 1 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A simple waveshaper distortion.";

        this.shaper = audioContext.createWaveShaper();
        this.shaper.curve = buildCurve(amount);
        this._amount = amount;

        this.wetGain = audioContext.createGain();
        this.wetGain.gain.value = wet;

        this.input.connect(this.shaper);
        this.shaper.connect(this.wetGain);
        this.wetGain.connect(this.output);

        this.params = {
            amount: {
                get: () => this._amount,
                set: (value) => {
                    this._amount = value;
                    this.shaper.curve = buildCurve(value);
                },
            },
            wet: {
                get: () => this.wetGain.gain.value,
                set: (value) => { this.wetGain.gain.value = value; },
            },
        };
    };

    get wet() {
        return this.wetGain.gain;
    };
};
```

Points worth noting, all copied from `reverb.js`/`delay.js`:

- **`this.input`/`this.output` are provided by the base class** — wire your DSP
  chain between them; never create your own input/output nodes.
- **Decide dry/wet at construction, not as an afterthought.** `NLLCReverb` and
  `NLLCDelay` both always pass dry signal straight through (`input.connect(output)`)
  in parallel with the wet path, so `wet=0` doesn't silence the channel — match
  this convention unless a processor is deliberately not supposed to have a dry
  path (e.g. a pure gain/distortion insert might reasonably *not* keep a separate
  dry path, as in the example above, since the wet path *is* the whole signal).
- **`this.params` is the command-router's introspection surface** —
  `{ paramName: { get(), set(value) } }`. `processorCommand` in `commands.js`
  calls `.set(Number(value))` for `/name param=value` and `.get()` to print current
  values for `/name` / `/name help`. Every param you want addressable from the
  console (or eventually the mixer) must appear here.
- **Expose automation-worthy params as raw `AudioParam` getters too** (like the
  `get wet()` above, or `NLLCDelay`'s `time`/`feedback`/`wet`) if you want the
  param usable as an `NLLCAutomationEvent` `target` — automation ramps call real
  `AudioParam` methods (`linearRampToValueAtTime` etc.), which plain
  JS-object params (like `amount` above, backed by a curve rebuild rather than an
  `AudioParam`) can't support. A param can be *just* a `params` entry (console/UI
  control only, like `amount`), *just* an `AudioParam` getter (rare), or both
  (like `wet` above) — pick based on whether it needs to be automatable.
- **`active` (routing bypass) is handled entirely by `NLLCChannel._rewireChain`** —
  you don't need to check `this.active` yourself inside the processor; when
  bypassed, the channel simply doesn't connect your `input`/`output` into the
  chain at all.
- **Any raw-`AudioParam` getter automatically gets console ramp support for
  free.** `processorCommand` (`commands.js`) is generic over `params` for both
  instant sets and ramps (`/myprocessor amount=0.8 3`, `at=beat`/`at=cycle`) —
  it reaches the `AudioParam` via `processor[key]` (your getter), not through
  `params[key].get()/.set()`. No extra code needed beyond exposing the getter,
  same as for `NLLCAutomationEvent` targets above.

## Registering it

```js
// nllc.js
import { NLLCDistortion } from "./distortion";

const PROCESSOR_TYPES = {
    reverb: NLLCReverb,
    delay: NLLCDelay,
    distortion: NLLCDistortion,   // add this
};
```

`/track_1 add_processor=distortion` and `/distortion amount=0.8` work immediately —
no other code changes needed, since `createProcessor` and `processorCommand` both
work generically off `PROCESSOR_TYPES` and `params`.
