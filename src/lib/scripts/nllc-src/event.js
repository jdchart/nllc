export class NLLCEvent {
    constructor({ beat, pitch = 60, velocity = 1, duration = 0.25 }) {
        this.beat = beat;
        this.pitch = pitch;
        this.velocity = velocity;
        this.duration = duration;
    };
};
