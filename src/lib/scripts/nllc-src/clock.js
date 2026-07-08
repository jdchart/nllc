import { scheduleAutomationEvent } from "./automation";

// A lookahead scheduler: rather than triggering sounds exactly when a setTimeout
// fires (which drifts under load), it periodically looks a short window into the
// future and schedules anything due using precise AudioContext time. Every
// registered "unit" (synth, channel, or processor) is polled uniformly for
// in-range events/automation; a unit only needs `events`/`automation` arrays,
// `trigger()`, and an `active` flag to participate.
export class NLLCClock {
    constructor(audioContext, { bpm = 120, loopLengthBeats = 4, lookaheadMs = 25, scheduleAheadTime = 0.1 } = {}) {
        this.audioContext = audioContext;

        this.bpm = bpm;
        this.loopLengthBeats = loopLengthBeats;
        this.lookaheadMs = lookaheadMs;
        this.scheduleAheadTime = scheduleAheadTime;

        this.units = [];
        this.running = false;
        this.timerId = null;

        this.startTime = 0;
        this.scheduledUpTo = 0;
    };

    get secondsPerBeat() {
        return 60 / this.bpm;
    };

    // Registers a unit (synth/channel/processor) to be polled for due
    // events/automation on every tick.
    addUnit(unit) {
        this.units.push(unit);
    };

    removeUnit(unit) {
        const index = this.units.indexOf(unit);
        if (index !== -1) this.units.splice(index, 1);
    };

    start() {
        if (this.running) return;
        this.running = true;
        this.startTime = this.audioContext.currentTime;
        this.scheduledUpTo = 0;
        this._tick();
    };

    stop() {
        this.running = false;
        clearTimeout(this.timerId);
    };

    // Changes tempo without a glitch: if the clock is already running, shifts
    // startTime so the current playback beat is unchanged at the moment of the
    // switch (only the rate of beats going forward changes).
    setBpm(bpm) {
        if (this.running) {
            const now = this.audioContext.currentTime;
            const currentBeat = (now - this.startTime) / this.secondsPerBeat;
            this.bpm = bpm;
            this.startTime = now - currentBeat * this.secondsPerBeat;
        } else {
            this.bpm = bpm;
        }
    };

    // Unlike setBpm, no rebasing is needed: _scheduleRange reads
    // loopLengthBeats fresh on every tick, so this takes effect on the next
    // tick. A change mid-loop can shift where the current loop boundary
    // falls, which is an accepted live-coding wrinkle rather than a bug.
    setLoopLengthBeats(beats) {
        this.loopLengthBeats = beats;
    };

    // Converts a beat position (loop-relative or absolute) into an absolute,
    // precise AudioContext timestamp suitable for scheduling.
    beatToTime(beat) {
        return this.startTime + beat * this.secondsPerBeat;
    };

    // The absolute (non-loop-relative) beat position right now.
    currentBeat() {
        return (this.audioContext.currentTime - this.startTime) / this.secondsPerBeat;
    };

    // The AudioContext time of the next upcoming integer beat boundary —
    // the anchor point for deferring a console ramp to "the next beat"
    // instead of firing immediately (see automation.js's scheduleRamp
    // `startTime` option).
    nextBeatTime() {
        return this.beatToTime(Math.floor(this.currentBeat()) + 1);
    };

    // The AudioContext time of the next loop boundary (the start of the next
    // pass through the pattern) — the anchor point for deferring a console
    // ramp to "the next cycle".
    nextCycleTime() {
        const currentLoopIndex = Math.floor(this.currentBeat() / this.loopLengthBeats);
        return this.beatToTime((currentLoopIndex + 1) * this.loopLengthBeats);
    };

    // Runs once per lookaheadMs: schedules anything due in the next
    // scheduleAheadTime seconds, then reschedules itself. Using setTimeout
    // (rather than requestAnimationFrame) keeps ticking in a backgrounded tab.
    _tick() {
        const now = this.audioContext.currentTime;
        const horizonBeat = (now + this.scheduleAheadTime - this.startTime) / this.secondsPerBeat;

        this._scheduleRange(this.scheduledUpTo, horizonBeat);
        this.scheduledUpTo = horizonBeat;

        this.timerId = setTimeout(() => this._tick(), this.lookaheadMs);
    };

    // Schedules every unit's events/automation whose beat falls within
    // [fromBeat, toBeat). The pattern repeats every loopLengthBeats, so a beat
    // range is first split into per-loop-iteration sub-ranges (a lookahead
    // window can straddle a loop boundary) and each sub-range is translated
    // back to loop-relative beats before being matched against unit.events.
    _scheduleRange(fromBeat, toBeat) {
        const loopStart = Math.floor(fromBeat / this.loopLengthBeats);
        const loopEnd = Math.floor(toBeat / this.loopLengthBeats);

        for (let loopIndex = loopStart; loopIndex <= loopEnd; loopIndex++) {
            const loopBeatStart = loopIndex * this.loopLengthBeats;
            const rangeStart = Math.max(fromBeat, loopBeatStart) - loopBeatStart;
            const rangeEnd = Math.min(toBeat, loopBeatStart + this.loopLengthBeats) - loopBeatStart;

            for (const unit of this.units) {
                // A paused track's synth, or a bypassed processor, stops being
                // scheduled entirely (both its events and its automation).
                if (unit.active === false) continue;

                for (const event of unit.events ?? []) {
                    if (event.beat >= rangeStart && event.beat < rangeEnd) {
                        const time = this.beatToTime(loopBeatStart + event.beat);
                        unit.trigger(time, event, this.secondsPerBeat);
                    }
                }

                for (const event of unit.automation ?? []) {
                    // `once` events (e.g. a one-time fade-in) fire on their first
                    // pass through this beat and never again on later loops.
                    if (event.once && event._scheduled) continue;
                    if (event.beat >= rangeStart && event.beat < rangeEnd) {
                        const time = this.beatToTime(loopBeatStart + event.beat);
                        scheduleAutomationEvent(time, event, this.secondsPerBeat);
                        event._scheduled = true;
                    }
                }
            }
        }
    };
};
