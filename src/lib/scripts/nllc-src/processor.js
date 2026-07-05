export class NLLCProcessor {
    constructor(audioContext) {
        this.llm_summary = "The basic processor class.";

        this.audioContext = audioContext;
        this.input = audioContext.createGain();
        this.output = audioContext.createGain();
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
