import { NLLCProcessor } from "./processor";

// A stereo ping-pong delay: independent left/right delay lines whose feedback
// crosses to the *opposite* channel (L's tail feeds R's delay line and vice
// versa) rather than back into itself, plus a small time offset on the right
// channel for stereo width. Dry signal always passes straight through.
export class NLLCDelay extends NLLCProcessor {
    constructor(audioContext, { name = "delay", time = 0.375, feedback = 0.35, wet = 0.3, stereoOffset = 0.06 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A stereo delay: independent left/right delay lines with cross-feedback (ping-pong) and a small time offset between channels for width.";

        this.stereoOffset = stereoOffset;

        const splitter = audioContext.createChannelSplitter(2);
        const merger = audioContext.createChannelMerger(2);

        this.delayL = audioContext.createDelay(5);
        this.delayR = audioContext.createDelay(5);
        this.delayL.delayTime.value = time;
        this.delayR.delayTime.value = time + stereoOffset;

        this.feedbackL = audioContext.createGain();
        this.feedbackR = audioContext.createGain();
        this.feedbackL.gain.value = feedback;
        this.feedbackR.gain.value = feedback;

        this.wetGain = audioContext.createGain();
        this.wetGain.gain.value = wet;

        // dry passthrough
        this.input.connect(this.output);

        this.input.connect(splitter);
        splitter.connect(this.delayL, 0);
        splitter.connect(this.delayR, 1);

        // cross-feedback: L feeds back into R's delay line and vice versa, for a ping-pong bounce
        this.delayL.connect(this.feedbackL);
        this.feedbackL.connect(this.delayR);
        this.delayR.connect(this.feedbackR);
        this.feedbackR.connect(this.delayL);

        this.delayL.connect(merger, 0, 0);
        this.delayR.connect(merger, 0, 1);

        merger.connect(this.wetGain);
        this.wetGain.connect(this.output);

        // Console/UI-facing control surface (see commands.js's processorCommand).
        this.params = {
            time: {
                get: () => this.delayL.delayTime.value,
                set: (value) => {
                    this.delayL.delayTime.value = value;
                    this.delayR.delayTime.value = value + this.stereoOffset;
                },
            },
            feedback: {
                get: () => this.feedbackL.gain.value,
                set: (value) => {
                    this.feedbackL.gain.value = value;
                    this.feedbackR.gain.value = value;
                },
            },
            wet: {
                get: () => this.wetGain.gain.value,
                set: (value) => { this.wetGain.gain.value = value; },
            },
        };
    };

    // Raw AudioParam accessors, so these params can also be used as
    // NLLCAutomationEvent targets (ramped over time), not just set instantly.
    get time() {
        return this.delayL.delayTime;
    };

    get feedback() {
        return this.feedbackL.gain;
    };

    get wet() {
        return this.wetGain.gain;
    };
};
