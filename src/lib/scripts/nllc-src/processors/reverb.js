import { NLLCProcessor } from "../processor";
import { NLLCParam } from "../param";

// Generates a synthetic impulse response: exponentially-decaying white noise
// per channel (not a recorded space). `decay` is the exponent of the falloff
// curve — higher values decay faster near the start of the buffer.
function buildImpulseResponse(audioContext, duration, decay) {
    const rate = audioContext.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const impulse = audioContext.createBuffer(2, length, rate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }

    return impulse;
};

// A convolution reverb: the dry signal always passes straight through, in
// parallel with a wet path convolved against a generated impulse response.
export class NLLCReverb extends NLLCProcessor {
    constructor(audioContext, { name = "reverb", duration = 2.5, decay = 3, wet = 0.3 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A simple algorithmic reverb: convolution against a generated impulse response, added on top of the dry signal.";

        this.convolver = audioContext.createConvolver();
        this.convolver.buffer = buildImpulseResponse(audioContext, duration, decay);

        this.wetGain = audioContext.createGain();
        this.wetGain.gain.value = wet;

        // dry passthrough, in parallel with the wet (convolved) path
        this.input.connect(this.output);
        this.input.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.output);

        // Console/UI-facing control surface (see commands.js's applyParams).
        this.params = {
            wet: new NLLCParam(this.wetGain.gain),
        };
    };

    // Thin alias onto params.wet's own AudioParam (not a second
    // implementation) so `wet` can also be used directly as an
    // NLLCAutomationEvent target, e.g. reverb.wet in a pattern-automation call.
    get wet() {
        return this.params.wet.audioParam;
    };
};
