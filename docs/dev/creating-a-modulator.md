# Creating a modulator

A modulator is anything that extends `NLLCModulator`, builds a
continuously-running Web Audio graph in its constructor (there's no
per-event `trigger()` — unlike a synth, a modulator is always "on"), connects
its final node into the inherited `this.output`, and populates `this.params`
with `NLLCParam`s so the console can inspect/control it — structurally, this
is almost exactly a processor (see [creating-a-processor.md](creating-a-processor.md)),
except a modulator never joins a channel's insert chain. It exists purely to
be *patched* into some other object's parameter (see
[user/commands.md](../user/commands.md#patching-modulators) for the `/patch`
command), so by convention its raw `output` should be a bipolar signal
(roughly `-1..1`) — the *patch* connecting it somewhere else decides the
depth, not the modulator itself.

## Minimal example

A smoothed random modulator ("sample and hold"-style wobble): continuous
white noise through a low-pass filter, with one runtime param (`rate`, the
filter's cutoff — higher values wobble faster/rougher):

```js
// src/lib/scripts/nllc-src/noisemod.js
import { NLLCModulator } from "./modulator";
import { NLLCParam } from "./param";

// A short buffer of white noise, looped continuously — same technique
// reverb.js uses for its impulse response, just looped instead of one-shot.
function buildNoiseBuffer(audioContext) {
    const length = audioContext.sampleRate * 2;
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
};

export class NLLCNoiseModulator extends NLLCModulator {
    constructor(audioContext, { name = "noisemod", rate = 4 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "Smoothed random noise: a continuous bipolar (-1..1) wobble, for patching into any parameter.";

        this.noise = audioContext.createBufferSource();
        this.noise.buffer = buildNoiseBuffer(audioContext);
        this.noise.loop = true;

        this.filter = audioContext.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = rate;

        this.noise.connect(this.filter).connect(this.output);
        this.noise.start();

        this.params = {
            rate: new NLLCParam(this.filter.frequency),
        };
    };

    get rate() {
        return this.params.rate.audioParam;
    };
};
```

Points worth noting, all copied from `lfo.js` (and, since a modulator is a
processor's sibling, `reverb.js`/`delay.js`):

- **`this.output` is provided by the base class** (a plain `GainNode`) —
  connect your node graph's final stage into it; never create your own
  output node.
- **Build the graph once, in the constructor, and start it immediately** —
  `this.noise.start()` above, same as `NLLCLFO`'s `this.osc.start()`. A
  modulator has no `trigger()`; it's always producing signal from the moment
  it's created (which may be before the engine's `/start`, while the
  `AudioContext` is still suspended — that's fine, it just won't render
  anything audible/measurable until the context resumes).
- **Keep the raw output bipolar (`-1..1`-ish), not scaled to a specific
  range or offset.** Depth and centering belong to the *patch* that connects
  this modulator somewhere (`/patch source=noisemod1 dest=reverb.wet
  depth=0.2`), not to the modulator — that's what lets the same modulator
  drive several destinations at different amounts. If your modulator's
  natural output range genuinely isn't bipolar (unlikely, but possible for an
  exotic source), that's a case-by-case call; every existing modulator keeps
  to the convention.
- **`this.params` works exactly like a processor's** — `{ paramName: NLLCParam }`
  (see `param.js` and [creating-a-processor.md](creating-a-processor.md)).
  `commands.js`'s `applyParams()` is fully generic over it, so `rate` gets
  instant-set, ramping (`/noisemod1 rate=20 3`), and deferred `at=`
  scheduling for free — no extra code.
- **A getter delegating to `params.<key>.audioParam`** (like `get rate()`
  above) is optional — only add one if you want the param usable directly as
  an `NLLCAutomationEvent` target elsewhere in the codebase (see
  `NLLCReverb.wet` for why). Nothing in the modulator/patch system itself
  needs it, since `NLLC._resolveDest` already reaches `params[key].audioParam`
  directly.

## Registering it

```js
// nllc.js
import { NLLCNoiseModulator } from "./noisemod";

const MODULATOR_TYPES = {
    lfo: NLLCLFO,
    noisemod: NLLCNoiseModulator,   // add this
};
```

`/add_modulator type=noisemod rate=8 name=wobble1` and `/wobble1 rate=20 3`
work immediately — no other code changes needed, since `createModulator` and
`modulatorCommand`/`applyParams` all work generically off `MODULATOR_TYPES`
and `params`. `/patch source=wobble1 dest=reverb.wet depth=0.3` patches it in
exactly the same way an `lfo` would, since patching only cares that the
source object has an `.output`.

## What a modulator can't do (yet)

A modulator today can only ever produce a continuous control signal — there's
no concept of a modulator (or a patch) *generating discrete events* (notes/
triggers) the way an algorithmic melody generator would need. Building that
would mean giving `NLLCSynth` some kind of "event input" alongside its
manually-authored `events` array, which hasn't been designed — don't invent
one speculatively; if you need this, it's worth a design discussion first
rather than bolting something on.
