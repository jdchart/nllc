import { NLLCModulator } from "./modulator";
import { NLLCParam } from "./param";

// A low-frequency oscillator: a continuously-running OscillatorNode whose raw
// output is a bipolar [-1, 1] control signal at `freq` Hz — the modular
// synthesis equivalent of a patch cable's source. It has no depth or offset
// of its own; patch it into any AudioParam (see patch.js) to wobble that
// param's existing value, with the *amount* of wobble controlled per-patch
// (so the same LFO can drive several destinations at different depths).
export class NLLCLFO extends NLLCModulator {
    constructor(audioContext, { name = "lfo", freq = 1, waveform = "sine" } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A low-frequency oscillator: a continuous bipolar (-1..1) control signal at a given rate, for patching into any parameter.";

        this.osc = audioContext.createOscillator();
        this.osc.type = waveform;
        this.osc.frequency.value = freq;
        this.osc.connect(this.output);
        this.osc.start();

        // Console/UI-facing control surface (see commands.js's applyParams).
        this.params = {
            freq: new NLLCParam(this.osc.frequency),
        };
    };

    // Thin alias onto params.freq's own AudioParam (not a second
    // implementation), so freq can also be used directly as an
    // NLLCAutomationEvent target or a patch destination's raw param.
    get freq() {
        return this.params.freq.audioParam;
    };
};
