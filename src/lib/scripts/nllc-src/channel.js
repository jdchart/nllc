// Base class for anything with a fader, pan, and an insert chain of
// processors: the master bus and every NLLCTrack. Owns the actual Web Audio
// nodes for that signal path and keeps them wired correctly as processors are
// added, removed, or bypassed. Not itself a sound source — NLLCTrack adds a
// `.source` synth on top of this.
export class NLLCChannel {
    constructor(audioContext, { name = "channel" } = {}) {
        this.name = name;

        this.audioContext = audioContext;
        this.input = audioContext.createGain();
        this.panner = audioContext.createStereoPanner();
        this.gainNode = audioContext.createGain();

        this.panner.connect(this.gainNode);

        this.processors = [];
        this.automation = [];

        this._rewireChain();
    };

    get volume() {
        return this.gainNode.gain;
    };

    get pan() {
        return this.panner.pan;
    };

    addAutomation(event) {
        this.automation.push(event);
        return event;
    };

    // Connects this channel's output to another channel (or a raw AudioNode,
    // e.g. audioContext.destination). Disconnects any previous destination
    // first, since a channel only ever feeds one place downstream.
    connect(destination) {
        this.gainNode.disconnect();
        this.gainNode.connect(destination.input ?? destination);
        return destination;
    };

    // Inserts a processor into the chain at `index` (default: appended at the
    // end) and rebuilds the actual node connections to include it.
    addProcessor(processor, index = this.processors.length) {
        this.processors.splice(index, 0, processor);
        processor._channel = this;
        this._rewireChain();
        return processor;
    };

    removeProcessor(id) {
        const index = this.processors.findIndex((p) => p.id === id);
        if (index === -1) return false;

        const [removed] = this.processors.splice(index, 1);
        // The removed processor is no longer walked by _rewireChain, so its own
        // outgoing edge to whatever came after it would otherwise dangle.
        removed.output.disconnect();
        removed._channel = null;

        this._rewireChain();
        return true;
    };

    // Toggles a processor's routing bypass (distinct from a track's own
    // transport start/stop) and rebuilds the chain to route around it.
    setProcessorActive(id, active) {
        const processor = this.processors.find((p) => p.id === id);
        if (!processor) return false;
        processor.active = active;
        this._rewireChain();
        return true;
    };

    // Rebuilds the actual node graph from scratch: input -> each active
    // processor in order (inactive ones are skipped/bypassed entirely, not
    // just muted) -> panner -> gainNode. This is the only place nodes are
    // connected/disconnected; every mutating method above just edits the
    // `processors` array and calls this to make the graph match it.
    _rewireChain() {
        this.input.disconnect();
        for (const processor of this.processors) {
            processor.output.disconnect();
        }

        let node = this.input;
        for (const processor of this.processors) {
            if (!processor.active) continue;
            node.connect(processor.input);
            node = processor.output;
        }

        node.connect(this.panner);
    };
};
