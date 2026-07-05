export class NLLCAutomationEvent {
    constructor({ beat, duration, target, from, to, curve = "linear", once = false }) {
        this.beat = beat;
        this.duration = duration; // in beats
        this.target = target; // an AudioParam
        this.from = from;
        this.to = to;
        this.curve = curve; // "linear" | "exponential" | "target"
        this.once = once; // fire a single time ever, instead of every loop pass
        this._scheduled = false;
    };
};

export function scheduleAutomationEvent(time, event, secondsPerBeat) {
    const endTime = time + event.duration * secondsPerBeat;
    const param = event.target;

    param.cancelScheduledValues(time);

    if (event.curve === "exponential") {
        // exponential ramps can't touch 0, so clamp both ends
        param.setValueAtTime(Math.max(event.from, 0.0001), time);
        param.exponentialRampToValueAtTime(Math.max(event.to, 0.0001), endTime);
    } else if (event.curve === "target") {
        param.setValueAtTime(event.from, time);
        param.setTargetAtTime(event.to, time, (endTime - time) / 4);
    } else {
        param.setValueAtTime(event.from, time);
        param.linearRampToValueAtTime(event.to, endTime);
    }
};
