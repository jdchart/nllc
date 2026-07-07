import { NLLCSynth } from "./synth";
import { NLLCEvent } from "./event";

// Converts a MIDI note number to frequency in Hz (A4 = MIDI 69 = 440Hz).
function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
};

// A short rising arpeggio so a freshly-created synth is audible right away;
// real event authoring is a separate future step.
function placeholderEvents() {
    return [0, 1, 2, 3].map((beat) => new NLLCEvent({ beat, pitch: 48 + beat * 2, velocity: 0.5, duration: 0.5 }));
};

// The default synth type: one oscillator per note, event.pitch treated as a
// MIDI note number.
export class NLLCOscSynth extends NLLCSynth {
    constructor(audioContext, { name = "oscsynth", waveform = "sawtooth" } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A basic subtractive synth voice: single oscillator per note into a gain envelope.";
        this.waveform = waveform;

        for (const event of placeholderEvents()) this.addEvent(event);
    };

    // Builds one voice per note: an oscillator through a gain envelope (a fast
    // 5ms linear attack, then an exponential decay across the note's
    // duration). Oscillators are one-shot, so a fresh one is created per hit
    // rather than reused, and stopped shortly after its envelope finishes.
    trigger(time, event, secondsPerBeat) {
        const ctx = this.audioContext;
        const durationSeconds = event.duration * secondsPerBeat;

        const osc = ctx.createOscillator();
        osc.type = this.waveform;
        osc.frequency.setValueAtTime(midiToFreq(event.pitch), time);

        const voiceGain = ctx.createGain();
        voiceGain.gain.setValueAtTime(0, time);
        voiceGain.gain.linearRampToValueAtTime(event.velocity, time + 0.005);
        // exponential ramps can't reach exactly 0, hence the 0.0001 floor
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + durationSeconds);

        osc.connect(voiceGain).connect(this.output);
        osc.start(time);
        osc.stop(time + durationSeconds + 0.05);
    };
};
