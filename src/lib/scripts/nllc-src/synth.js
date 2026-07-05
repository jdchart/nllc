function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
};

export class NLLCSynth {
    constructor(audioContext, destination, { name = "synth" } = {}) {
        this.llm_summary = "The basic synth class.";
        this.name = name;

        this.audioContext = audioContext;
        this.output = audioContext.createGain();
        this.output.connect(destination.input ?? destination);

        this.events = [];
        this.automation = [];
    };

    get volume() {
        return this.output.gain;
    };

    addEvent(event) {
        this.events.push(event);
        return event;
    };

    addAutomation(event) {
        this.automation.push(event);
        return event;
    };

    trigger(time, event, secondsPerBeat) {
        const ctx = this.audioContext;
        const durationSeconds = event.duration * secondsPerBeat;

        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(midiToFreq(event.pitch), time);

        const voiceGain = ctx.createGain();
        voiceGain.gain.setValueAtTime(0, time);
        voiceGain.gain.linearRampToValueAtTime(event.velocity, time + 0.005);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds);

        osc.connect(voiceGain).connect(this.output);
        osc.start(time);
        osc.stop(time + durationSeconds + 0.05);
    };
};
