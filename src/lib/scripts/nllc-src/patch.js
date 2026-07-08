import { NLLCParam } from "./param";

// A single "patch cable": connects a source's raw output (a modulator, or
// any other object exposing `.output` — a track/master's post-fader signal,
// a processor's post-effect signal) into a destination AudioParam, through
// its own depth (attenuator) gain node. Depth lives on the patch rather than
// the source or destination, so the same modulator can drive several
// destinations at different amounts, and removing one patch never touches
// either endpoint directly — it just tears down the one cable.
//
// `sourceObject`/`destObject` (plus the display-only `sourceName`/`destName`
// strings) are kept so NLLC can cascade-remove a patch when either endpoint
// is itself removed (see nllc.js's removeModulator/removeProcessor/removeTrack).
export class NLLCPatch {
    constructor(audioContext, { id, sourceObject, sourceName, destObject, destName, destParam, depth = 1 }) {
        this.id = id;
        this.sourceObject = sourceObject;
        this.sourceName = sourceName;
        this.destObject = destObject;
        this.destName = destName;
        this.destParam = destParam;

        this.depthGain = audioContext.createGain();
        this.depthGain.gain.value = depth;

        sourceObject.output.connect(this.depthGain);
        this.depthGain.connect(destParam);

        // Console/UI-facing control surface (see commands.js's applyParams),
        // same shape every other patchable object's params use.
        this.params = {
            depth: new NLLCParam(this.depthGain.gain),
        };
    };

    // Thin alias onto params.depth's own AudioParam (not a second
    // implementation) — used by patchSummary/PatchList.svelte for display.
    get depth() {
        return this.params.depth.audioParam;
    };

    disconnect() {
        this.sourceObject.output.disconnect(this.depthGain);
        this.depthGain.disconnect(this.destParam);
    };
};
