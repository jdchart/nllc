import { NLLCClock } from "./clock";
import { NLLCSynth } from "./synth";
import { NLLCChannel } from "./channel";
import { NLLCTrack } from "./track";
import { NLLCReverb } from "./reverb";
import { NLLCDelay } from "./delay";

const PROCESSOR_TYPES = {
    reverb: NLLCReverb,
    delay: NLLCDelay,
};

export class NLLC {
    constructor() {
        this.audioContext = new AudioContext();
        // Some browsers grant AudioContext a running start if page navigation
        // counted as a user gesture, even though nothing has called start()
        // yet. Force it suspended so the UI's off-by-default state is honest.
        this.audioContext.suspend();
        this.running = false;

        this.master = new NLLCChannel(this.audioContext, { name: "master" });
        this.master.connect(this.audioContext.destination);

        this.tracks = [];
        this.processors = [];
        this._processorIdCounter = 0;

        this.clock = new NLLCClock(this.audioContext);
        this.clock.addUnit(this.master);
    };

    // audioContext.resume() must run synchronously within a user-gesture
    // call stack (e.g. a keydown handler), which /start satisfies.
    start() {
        this.audioContext.resume();
        this.clock.start();
        this.running = true;
    };

    stop() {
        this.clock.stop();
        this.audioContext.suspend();
        this.running = false;
    };

    _uniqueName(base, existingNames) {
        if (!existingNames.includes(base)) return base;

        let i = 2;
        while (existingNames.includes(`${base}_${i}`)) i++;
        return `${base}_${i}`;
    };

    createTrack(options = {}) {
        const name = this._uniqueName(options.name ?? "track", this.tracks.map((t) => t.name));

        const source = new NLLCSynth(this.audioContext, { ...options, name });
        const track = new NLLCTrack(this.audioContext, source, { name });
        track.connect(this.master);

        this.tracks.push(track);
        this.clock.addUnit(source);
        this.clock.addUnit(track);

        return track;
    };

    createProcessor(type, options = {}) {
        const ProcessorClass = PROCESSOR_TYPES[type];
        if (!ProcessorClass) {
            throw new Error(`unknown processor type "${type}"`);
        }

        const name = this._uniqueName(options.name ?? type, this.processors.map((p) => p.name));
        const processor = new ProcessorClass(this.audioContext, { ...options, name });
        processor.id = `p${++this._processorIdCounter}`;

        this.processors.push(processor);
        this.clock.addUnit(processor);

        return processor;
    };

    removeTrack(track) {
        const index = this.tracks.indexOf(track);
        if (index === -1) return false;

        for (const processor of [...track.processors]) {
            this.removeProcessor(processor);
        }

        track.source.output.disconnect();
        track.input.disconnect();
        track.gainNode.disconnect();

        this.tracks.splice(index, 1);
        this.clock.removeUnit(track.source);
        this.clock.removeUnit(track);

        return true;
    };

    removeProcessor(processor) {
        const index = this.processors.indexOf(processor);
        if (index === -1) return false;

        processor._channel?.removeProcessor(processor.id);

        this.processors.splice(index, 1);
        this.clock.removeUnit(processor);

        return true;
    };
};
