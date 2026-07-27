// Placeholder for the natural-language routing layer — NLLC's own reason for
// being, and the one piece that stays in the app rather than the engine. The
// intended integration point for translating free-text user input into ribbit
// slash-commands (or direct graph mutations) via a local Ollama model. Not yet
// wired to anything — ribbit's createCommandRouter is the vocabulary it will
// eventually target. See docs/dev/architecture.md.
export class Ollama {
    constructor() {
        this.model = ""
    };
};