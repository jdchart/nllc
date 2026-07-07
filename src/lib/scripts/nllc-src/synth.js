// Base class for every sound-producing voice (see oscsynth.js, sampler.js).
// A track's `.source` is always an NLLCSynth subclass. Subclasses connect
// their own Web Audio nodes into the inherited `this.output` GainNode and
// override `trigger()`; everything else (event storage, the active/pause
// flag) is handled generically here so a new synth only needs to implement
// sound generation.
export class NLLCSynth {
    constructor(audioContext, { name = "synth" } = {}) {
        this.llm_summary = "The basic synth class.";
        this.name = name;

        this.audioContext = audioContext;
        this.output = audioContext.createGain();

        this.events = [];
        this.automation = [];
        this.params = {};

        // Whether the clock schedules this synth's events/automation at all
        // (a transport pause, toggled by /track_1 start|stop), not a param.
        this.active = true;
    };

    // Adds a note/hit to this synth's pattern; returns it so callers can hold
    // onto the reference (e.g. to remove it later).
    addEvent(event) {
        this.events.push(event);
        return event;
    };

    addAutomation(event) {
        this.automation.push(event);
        return event;
    };

    // Called by NLLCClock once per due event, with a precise AudioContext
    // timestamp. Subclasses build fresh Web Audio nodes here (oscillators/
    // buffer sources are one-shot, so they can't be pre-built and reused) and
    // connect them into `this.output`. Base implementation is a silent no-op.
    trigger(time, event, secondsPerBeat) {};
};
