import { NLLCClock } from "./clock";
import { NLLCSynth } from "./synth";
import { NLLCReverb } from "./reverb";

export class NLLC {
    constructor() {
        this.audioContext = new AudioContext();
        this.master = this.audioContext.createGain();
        this.master.connect(this.audioContext.destination);

        this.synths = [];
        this.processors = [];
        this.clock = new NLLCClock(this.audioContext);

        this._armAutoStart();
    };

    addSynth(synth) {
        this.synths.push(synth);
        this.clock.addUnit(synth);
        return synth;
    };

    addProcessor(processor) {
        this.processors.push(processor);
        this.clock.addUnit(processor);
        return processor;
    };

    createSynth(destination = this.master, options = {}) {
        return this.addSynth(new NLLCSynth(this.audioContext, destination, options));
    };

    createReverb(options, destination = this.master) {
        const reverb = new NLLCReverb(this.audioContext, options);
        reverb.connect(destination);
        return this.addProcessor(reverb);
    };

    // Browsers block audio until a user gesture, so this arms the clock
    // to start on the first click/keypress rather than requiring an
    // explicit start() call.
    _armAutoStart() {
        const start = () => {
            this.audioContext.resume();
            this.clock.start();
            window.removeEventListener("pointerdown", start);
            window.removeEventListener("keydown", start);
        };
        window.addEventListener("pointerdown", start);
        window.addEventListener("keydown", start);
    };
};
