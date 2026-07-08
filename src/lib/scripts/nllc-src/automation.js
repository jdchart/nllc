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

// Draws one ramp on `param` between `time` and `endTime`. The one place that
// knows how to turn a curve name into actual AudioParam calls — shared by
// scheduleAutomationEvent (loop-position pattern automation) and scheduleRamp
// (one-off console ramps) so the two can't drift apart. `curve` selects the
// shape: "linear" (constant rate), "exponential" (clamped away from 0, since
// exponential ramps can't reach it), or "target" (an asymptotic approach via
// setTargetAtTime, using a quarter of the span as the time constant for a
// smoother settle).
function applyRamp(param, time, endTime, from, to, curve) {
    param.cancelScheduledValues(time);

    if (curve === "exponential") {
        param.setValueAtTime(Math.max(from, 0.0001), time);
        param.exponentialRampToValueAtTime(Math.max(to, 0.0001), endTime);
    } else if (curve === "target") {
        param.setValueAtTime(from, time);
        param.setTargetAtTime(to, time, (endTime - time) / 4);
    } else {
        param.setValueAtTime(from, time);
        param.linearRampToValueAtTime(to, endTime);
    }
};

// Applies one automation event's ramp to its target AudioParam starting at
// `time` (an absolute AudioContext timestamp the clock computed from the
// event's loop-relative beat).
export function scheduleAutomationEvent(time, event, secondsPerBeat) {
    const endTime = time + event.duration * secondsPerBeat;
    applyRamp(event.target, time, endTime, event.from, event.to, event.curve);
};

// Ramps a raw AudioParam from `from` to `to` over `durationSeconds`, starting
// at `startTime` (an absolute AudioContext timestamp; defaults to right now).
// This is the vehicle for one-off console ramps like `/track_1 gain=0 3` (see
// commands.js) — distinct from scheduleAutomationEvent's loop-position
// pattern automation, though both draw the curve identically via applyRamp.
// Passing an explicit `startTime` (e.g. clock.nextBeatTime()/nextCycleTime())
// is how a ramp gets deferred to the next beat/cycle instead of firing
// immediately.
export function scheduleRamp(audioContext, param, from, to, durationSeconds, { startTime, curve = "linear" } = {}) {
    const time = startTime ?? audioContext.currentTime;
    applyRamp(param, time, time + durationSeconds, from, to, curve);
};
