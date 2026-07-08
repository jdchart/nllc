import { NLLCSynth } from "./synth";

const SAMPLE_FILES = [
    "CLAUDE - kick02.wav",
    "CLAUDE - kick03.wav",
    "CLAUDE - distorted snare06.wav",
    "CLAUDE - distorted snare07.wav",
    "CLAUDE - hat13.wav",
    "CLAUDE - hat14.wav",
];

// Derives a short display name from a sample filename, e.g.
// "CLAUDE - kick02.wav" -> "kick02".
function sampleName(filename) {
    return filename.replace(/^CLAUDE - /, "").replace(/\.\w+$/, "");
};

// A drum-machine-style synth: a fixed set of loaded sample buffers ("slots"),
// where an event's pitch selects which one to play. Starts with an empty
// pattern — see commands.js's add_event/clear_events for authoring events
// onto it (pitch selects a slot index, not a MIDI note).
export class NLLCSampler extends NLLCSynth {
    constructor(audioContext, { name = "sampler", samples = SAMPLE_FILES } = {}) {
        super(audioContext, { name });
        this.llm_summary = "A sample player: each event's pitch selects one of a fixed set of loaded sample slots to trigger (0 = first slot, wrapping if out of range).";

        this.slots = samples.map((filename) => ({
            name: sampleName(filename),
            // filenames contain spaces, so they must be URL-encoded to be
            // fetchable as a path under static/samples
            url: `/samples/${encodeURIComponent(filename)}`,
            buffer: null,
        }));
        // Fire-and-forget: nothing awaits `_loaded`, so a trigger for a slot
        // whose buffer hasn't finished loading yet silently does nothing
        // (see trigger()'s `if (!slot?.buffer) return`) rather than queuing.
        this._loaded = this._loadAll();
    };

    // Fetches and decodes every sample file in parallel, filling in each
    // slot's `buffer` in place as it finishes.
    async _loadAll() {
        await Promise.all(this.slots.map(async (slot) => {
            const response = await fetch(slot.url);
            const arrayBuffer = await response.arrayBuffer();
            slot.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        }));
    };

    // Selects a slot by event.pitch, wrapping (including for negative
    // pitches, hence the double modulo) rather than throwing out of range,
    // and plays it once through a simple velocity-scaled gain.
    trigger(time, event, secondsPerBeat) {
        const slot = this.slots[((event.pitch % this.slots.length) + this.slots.length) % this.slots.length];
        if (!slot?.buffer) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = slot.buffer;

        const voiceGain = this.audioContext.createGain();
        voiceGain.gain.value = event.velocity;

        source.connect(voiceGain).connect(this.output);
        source.start(time);
    };
};
