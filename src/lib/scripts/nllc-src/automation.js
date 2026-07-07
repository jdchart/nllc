// A scheduled ramp of a real Web Audio AudioParam (e.g. a channel's `volume`,
// a processor's `wet`), added to a channel's or processor's `automation` list
// the same way an NLLCEvent is added to a synth's `events` list. The clock
// calls scheduleAutomationEvent() directly for these — there's no `trigger()`
// step, since ramping an AudioParam is generic across every target.
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

// Applies one automation event's ramp to its target AudioParam starting at
// `time`. `curve` selects the ramp shape: "linear" (constant rate),
// "exponential" (clamped away from 0, since exponential ramps can't reach it),
// or "target" (an asymptotic approach via setTargetAtTime, using a quarter of
// the event's duration as the time constant for a smoother settle).
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
