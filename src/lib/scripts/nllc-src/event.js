// A single scheduled note/hit on a synth's `events` list. `beat` is
// loop-relative (0 to the clock's loopLengthBeats); `duration` is in beats, not
// seconds (the clock converts using its current tempo at trigger time). Plain
// data only — synths interpret `pitch`/`velocity` however suits them (e.g. as a
// MIDI note vs. as a sample-slot index).
export class NLLCEvent {
    constructor({ beat, pitch = 60, velocity = 1, duration = 0.25 }) {
        this.beat = beat;
        this.pitch = pitch;
        this.velocity = velocity;
        this.duration = duration;
    };
};
