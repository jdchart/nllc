# LLM context: building a modulator

Full tutorial with rationale: `docs/dev/creating-a-modulator.md`. This is the
condensed recipe.

A modulator extends `NLLCModulator` (`src/lib/scripts/nllc-src/modulator.js`),
which provides `this.output` (a `GainNode`). Structurally a processor's
sibling — build a continuously-running Web Audio graph in the constructor
(no `trigger()`, always "on"), connect it into `this.output`, populate
`this.params` as `{ paramName: NLLCParam }` (`param.js`) exactly like a
processor does. The one real difference: a modulator never joins a channel's
insert chain — it exists only to be patched (`/patch source=... dest=...`)
into some other object's parameter, so keep its raw output bipolar
(`-1..1`-ish); depth/centering belong to the *patch*, not the modulator.

```js
import { NLLCModulator } from "./modulator";
import { NLLCParam } from "./param";

export class NLLCMyModulator extends NLLCModulator {
    constructor(audioContext, { name = "mymod", rate = 4 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "One-line description shown in /help.";

        // build a continuously-running node graph, start it immediately,
        // connect its final stage into this.output
        this.osc = audioContext.createOscillator();
        this.osc.frequency.value = rate;
        this.osc.connect(this.output);
        this.osc.start();

        this.params = {
            rate: new NLLCParam(this.osc.frequency),
        };
    };
};
```

Register it in `nllc.js`'s `MODULATOR_TYPES` map (`{ mymod: NLLCMyModulator }`)
— the only other required change. That alone makes `/add_modulator
type=mymod rate=8 name=mod1`, `/mod1 rate=20 3` (ramping), `/mod1 help`, and
`/mod1 remove_self` all work, plus `/patch source=mod1 dest=reverb.wet
depth=0.3` (patching only needs `.output`, so any modulator qualifies as a
source automatically). Removing the modulator cascade-removes any patch that
references it.

Not built yet, don't invent it speculatively: a modulator/patch that
generates discrete events (notes/triggers) rather than a continuous signal —
that would need an "event input" concept on `NLLCSynth` that doesn't exist.
