import { scheduleAutomationEvent } from "./automation";

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

    beatToTime(beat) {
        return this.startTime + beat * this.secondsPerBeat;
    };

    _tick() {
        const now = this.audioContext.currentTime;
        const horizonBeat = (now + this.scheduleAheadTime - this.startTime) / this.secondsPerBeat;

        this._scheduleRange(this.scheduledUpTo, horizonBeat);
        this.scheduledUpTo = horizonBeat;

        this.timerId = setTimeout(() => this._tick(), this.lookaheadMs);
    };

    _scheduleRange(fromBeat, toBeat) {
        const loopStart = Math.floor(fromBeat / this.loopLengthBeats);
        const loopEnd = Math.floor(toBeat / this.loopLengthBeats);

        for (let loopIndex = loopStart; loopIndex <= loopEnd; loopIndex++) {
            const loopBeatStart = loopIndex * this.loopLengthBeats;
            const rangeStart = Math.max(fromBeat, loopBeatStart) - loopBeatStart;
            const rangeEnd = Math.min(toBeat, loopBeatStart + this.loopLengthBeats) - loopBeatStart;

            for (const unit of this.units) {
                for (const event of unit.events ?? []) {
                    if (event.beat >= rangeStart && event.beat < rangeEnd) {
                        const time = this.beatToTime(loopBeatStart + event.beat);
                        unit.trigger(time, event, this.secondsPerBeat);
                    }
                }

                for (const event of unit.automation ?? []) {
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
