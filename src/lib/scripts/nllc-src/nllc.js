import { NLLCClock } from "./clock";
import { NLLCChannel } from "./channel";
import { NLLCTrack } from "./track";
import { NLLCReverb } from "./reverb";
import { NLLCDelay } from "./delay";
import { NLLCOscSynth } from "./oscsynth";
import { NLLCSampler } from "./sampler";

// String-keyed registries that map a command/UI-facing type name to a class.
// Adding a new synth or processor type means adding one entry here (plus the
// import) — createSynth/createProcessor and the command router
// (synth=/add_processor=) look types up dynamically, with no other code
// needing to know new types exist. See docs/dev/creating-a-synth.md and
// docs/dev/creating-a-processor.md.
const PROCESSOR_TYPES = {
    reverb: NLLCReverb,
    delay: NLLCDelay,
};

const SYNTH_TYPES = {
    oscsynth: NLLCOscSynth,
    sampler: NLLCSampler,
};

// The top-level owner: one instance per page. Holds the AudioContext, the
// clock, the master bus, and every track/processor, and is the only place
// that knows how to construct/register/tear down any of them. Both the
// command router (commands.js) and the Svelte UI operate on one shared NLLC
// instance rather than their own copies of this state.
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

    // Appends "_2", "_3", ... to `base` until it no longer collides with
    // `existingNames`. Used to keep both track names and processor names
    // unique within their own namespace (independently of each other).
    _uniqueName(base, existingNames) {
        if (!existingNames.includes(base)) return base;

        let i = 2;
        while (existingNames.includes(`${base}_${i}`)) i++;
        return `${base}_${i}`;
    };

    // Looks up `type` in SYNTH_TYPES and constructs an instance. Does not
    // register it with the clock or a track by itself — see createTrack and
    // setTrackSynth, which call this and then wire the result in.
    createSynth(type, options = {}) {
        const SynthClass = SYNTH_TYPES[type];
        if (!SynthClass) {
            throw new Error(`unknown synth type "${type}"`);
        }

        return new SynthClass(this.audioContext, options);
    };

    // Creates a fully-wired track: a unique name, a synth (default
    // "oscsynth"), connected to master, and registered with the clock as two
    // separate units (the synth for its own events, the track itself for its
    // own automation — see clock.js).
    createTrack(options = {}) {
        const name = this._uniqueName(options.name ?? "track", this.tracks.map((t) => t.name));

        // The synth keeps its own type-based name (e.g. "oscsynth", "sampler")
        // rather than inheriting the track's name — "name"/"synth" here are
        // track-level options, not meant to reach the synth's constructor.
        const { name: _trackName, synth: synthType, ...synthOptions } = options;
        const source = this.createSynth(synthType ?? "oscsynth", synthOptions);
        const track = new NLLCTrack(this.audioContext, source, { name });
        track.connect(this.master);

        this.tracks.push(track);
        this.clock.addUnit(source);
        this.clock.addUnit(track);

        return track;
    };

    // Swaps a track's synth at runtime (e.g. /track_1 synth=sampler),
    // deregistering the old synth from the clock and registering the new one
    // so it starts being scheduled immediately.
    setTrackSynth(track, type, options = {}) {
        const newSource = this.createSynth(type, options);

        this.clock.removeUnit(track.source);
        track.setSource(newSource);
        this.clock.addUnit(newSource);

        return newSource;
    };

    // Creates a processor, assigns it a unique name and a stable id (e.g.
    // "p1") used for cross-referencing from a channel's insert list, and
    // registers it with the clock (for its own automation). Note this does
    // NOT insert it into any channel's chain — callers (e.g. channelCommand's
    // add_processor=) still need to call channel.addProcessor(processor).
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

    // Fully removes a track: tears down its own processor inserts, disconnects
    // every node it owns, and deregisters both the track and its synth from
    // the clock. Returns false (no-op) if the track isn't actually registered.
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

    // Removes a processor from whichever channel currently holds it (if any)
    // and deregisters it from the clock. Returns false (no-op) if the
    // processor isn't actually registered.
    removeProcessor(processor) {
        const index = this.processors.indexOf(processor);
        if (index === -1) return false;

        processor._channel?.removeProcessor(processor.id);

        this.processors.splice(index, 1);
        this.clock.removeUnit(processor);

        return true;
    };
};
