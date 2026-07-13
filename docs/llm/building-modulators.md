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
// src/lib/scripts/nllc-src/modulators/mymod.js — non-base modulators live in
// their own modulators/ subfolder, one level down from the base classes.
import { NLLCModulator } from "../modulator";
import { NLLCParam } from "../param";

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

Register it in `nllc.js`'s `MODULATOR_TYPES` map (`import { NLLCMyModulator }
from "./modulators/mymod"; ... { mymod: NLLCMyModulator }`) — the only other
required change. That alone makes `/add_modulator
type=mymod rate=8 name=mod1`, `/mod1 rate=20 3` (ramping), `/mod1 help`, and
`/mod1 remove_self` all work, plus `/patch source=mod1 dest=reverb.wet
depth=0.3` (patching only needs `.output`, so any modulator qualifies as a
source automatically). Removing the modulator cascade-removes any patch that
references it.

For a runtime setting that isn't a param (like `NLLCLFO`'s `waveform`, or
`NLLCRandomNotes`' `scale`), declare it in `this.options` — `{ key: {
get(), set(value), choices? } }`. One declaration makes it console-settable
(`/mod1 waveform=square`, validated against `choices`; ramp specs
rejected), lists it in `help`, and round-trips it through
`/save_session`/`/recall` — the base `getOptions()` derives from the map,
so don't override it. See `modulators/lfo.js`/`randomnotes.js` for the two
real examples.

A modulator can instead generate discrete events (notes) rather than a
continuous signal — see `modulators/randomnotes.js` (`NLLCRandomNotes`) for
the pattern: expose `generateEvents(fromBeat, toBeat)` (called by
`NLLCClock` every tick with an absolute, non-loop-relative beat range — see
clock.js) returning whatever `NLLCEvent`s should fire, and initialize
`this.eventDestinations = []`. If the generator keeps absolute-beat state
(a "next candidate beat" cursor etc.), also implement `onClockStart()`
(duck-typed, called by `NLLCClock.start()`) to reset it — a clock (re)start
rewinds absolute beats to 0. Such a modulator has no meaningful continuous
`.output`; instead it's patched into a track's synth via `/patch
source=<generator> dest=<track>.notes` (the reserved `.notes` destination —
see `nllc.js`'s `createPatch`/`_createEventPatch` and `patch.js`'s
`NLLCEventPatch`), which is bookkeeping-only (no AudioParam, no `depth`) and
lives alongside — never replaces — a synth's manually-authored `events`.
