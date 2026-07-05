import { NLLCChannel } from "./channel";

export class NLLCTrack extends NLLCChannel {
    constructor(audioContext, source, options = {}) {
        super(audioContext, options);
        this.source = source;
        source.output.connect(this.input);
    };
};
