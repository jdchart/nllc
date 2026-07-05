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

    connect(destination) {
        this.gainNode.disconnect();
        this.gainNode.connect(destination.input ?? destination);
        return destination;
    };

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

    setProcessorActive(id, active) {
        const processor = this.processors.find((p) => p.id === id);
        if (!processor) return false;
        processor.active = active;
        this._rewireChain();
        return true;
    };

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
