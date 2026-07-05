export class NLLCProcessor {
    constructor(audioContext, { name = "processor" } = {}) {
        this.llm_summary = "The basic processor class.";
        this.name = name;

        this.audioContext = audioContext;
        this.input = audioContext.createGain();
        this.output = audioContext.createGain();

        // Whether the containing Channel routes signal through this processor
        // at all (a true bypass, handled by Channel._rewireChain), not a param.
        this.active = true;

        // Generic command-line introspection surface: { paramName: { get(), set(value) } }.
        // Distinct from raw AudioParam getters (e.g. .wet) used as automation targets.
        this.params = {};
        this.automation = [];
    };

    addAutomation(event) {
        this.automation.push(event);
        return event;
    };

    connect(destination) {
        this.output.connect(destination.input ?? destination);
        return destination;
    };
};
