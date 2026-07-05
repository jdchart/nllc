import { NLLCProcessor } from "./processor";

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

export class NLLCReverb extends NLLCProcessor {
    constructor(audioContext, { name = "reverb", duration = 2.5, decay = 3, wet = 0.3 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A simple algorithmic reverb: convolution against a generated impulse response, added on top of the dry signal.";

        this.convolver = audioContext.createConvolver();
        this.convolver.buffer = buildImpulseResponse(audioContext, duration, decay);

        this.wetGain = audioContext.createGain();
        this.wetGain.gain.value = wet;

        this.input.connect(this.output);
        this.input.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.output);

        this.params = {
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
