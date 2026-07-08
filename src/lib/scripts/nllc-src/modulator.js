// Base class for every modulation source (see lfo.js). A modulator is a
// named, addressable object registered with NLLC the same way a synth or
// processor is — it can be created, addressed by name from the console, and
// removed — but unlike a synth it never attaches to a track's chain; it
// exists purely to be patched (see patch.js) into some other object's
// parameter. Subclasses build their own continuously-running Web Audio graph
// in the constructor (there's no per-event trigger) and expose their raw
// output via `this.output` — by convention a bipolar signal roughly in
// [-1, 1], since a patch's own depth (see patch.js) — not the modulator —
// decides how hard that signal pushes any given destination.
export class NLLCModulator {
    constructor(audioContext, { name = "modulator" } = {}) {
        this.llm_summary = "The basic modulator class.";
        this.name = name;

        this.audioContext = audioContext;
        this.output = audioContext.createGain();

        // Generic command-line introspection surface, same shape as
        // NLLCProcessor.params: { paramName: { get(), set(value) } }.
        this.params = {};
    };
};
