// Placeholder for the natural-language routing layer: the intended integration
// point for translating free-text user input into NLLC commands (or direct
// graph mutations) via a local Ollama model. Not yet wired to anything —
// commands.js's createCommandRouter is the vocabulary it will eventually
// target. See docs/llm/overview.md.
export class Ollama {
    constructor() {
        this.model = ""
    };
};