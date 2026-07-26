import { NLLCSynth } from "../synth";
import { NLLCParam } from "../param";
import { NLLCEvent } from "../event";

// Each of the 8 channels' resonant/oscillator frequency, spread like a drum
// kit (low thumps through mid "snare" range up to bright "hat"-ish highs)
// rather than clustered in one register — each channel should read as its
// own distinct voice.
const CHANNEL_BASE_FREQS = [35, 60, 100, 160, 280, 500, 1000, 2200];
const RESONANCE_Q = 7;

// The hit envelope's own decay is what makes a channel sound like a
// percussive click rather than a held tone — capped here regardless of
// gate length; only a gate held past this gets a (much quieter) drone tail
// appended after the click. See trigger()'s hitEnvelope scheduling.
const CLICK_SECONDS = 0.1;

// How often (in beats) the idle self-glitch loop rolls the dice — see
// generateEvents() below. Fixed rather than a param: it's the grid a
// candidate *could* land on, not how often one actually does (that's cv).
const GLITCH_GRID_BEATS = 0.125;

// A short buffer of flat white noise, reused (via multiple independent
// BufferSourceNode instances, not shared playback state) for the always-on
// (heavily filtered) ambient noise floor and every trigger()'s attack click.
function buildNoiseBuffer(audioContext, seconds) {
    const rate = audioContext.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = audioContext.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
};

// Classic sigmoid waveshaper curve — `amount` controls how hard the knee
// bends (higher = harsher/more clipped).
function buildDistortionCurve(amount, samples = 1024) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * 2 - 1;
        curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
};

// A bit-reduction/quantization curve — stair-steps the signal into `steps`
// discrete levels, the classic "digital grit" texture (harsh, aliased,
// grainy) that a smooth waveshaper curve alone can't produce.
function buildBitcrushCurve(steps, samples = 1024) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
};

// Emulates the Landscape Noon: a powerless 8-channel analog rhythm/drone
// instrument that only moves when fed gate/CV voltage, whose channels link
// together and "grow, inform and process one another." Unlike every other
// synth here, this one is NOT built fresh per trigger() — its 8 channels and
// their cross-channel feedback ring are persistent, continuously-running Web
// Audio nodes (the "always-on circuit"), because the character this is
// emulating IS that continuity.
//
// Each channel layers three things into a shared, explicitly-shaped "hit"
// envelope (not the resonator's own uncontrolled ring — that read as a
// sustained drone/buzz, not a percussive hit): a persistent square
// oscillator (pitched body), a short noise burst run through the same
// resonator (a pitched "thock"), and a second copy of that noise burst run
// through a highpass filter that bypasses the resonator entirely (a bright,
// unfiltered "snap" — without this, everything reads as low and muffled).
// The combined signal is driven into distortion, then bit-crushed for grit,
// then gated by the hit envelope: a fast attack and a decay capped at
// CLICK_SECONDS regardless of gate length, so a normal (short) event reads
// as a sharp click — a genuinely long-held gate gets a quieter drone tail
// appended after that initial click, not instead of it.
export class NLLCNoon extends NLLCSynth {
    constructor(audioContext, { name = "noon", cv = 0.15, link = 0.12 } = {}) {
        super(audioContext, { name });
        this.llm_summary = "An 8-channel self-generating noise/click circuit emulating the Landscape Noon, drum-machine-like: event.pitch (0-7) picks a channel to hit, duration is gate length (short = a sharp click, long = click + a quiet drone tail), channels cross-feed their neighbors and idle-chatter on their own — density AND grit (drive into distortion/bitcrush) scale with the cv param, patchable from a cv modulator.";

        const ctx = audioContext;
        this._noiseBuffer = buildNoiseBuffer(ctx, 1.5);

        // Idle noise floor: quiet and lowpassed, so it reads as a low hum/
        // crackle rather than broadband hiss.
        this.ambientNoiseSource = ctx.createBufferSource();
        this.ambientNoiseSource.buffer = this._noiseBuffer;
        this.ambientNoiseSource.loop = true;
        this.ambientNoiseSource.start();
        this.ambientLowpass = ctx.createBiquadFilter();
        this.ambientLowpass.type = "lowpass";
        this.ambientLowpass.frequency.value = 300;
        this.ambientNoiseSource.connect(this.ambientLowpass);

        this.mixBus = ctx.createGain();
        this.finalShaper = ctx.createWaveShaper();
        this.finalShaper.curve = buildDistortionCurve(6);
        this.finalShaper.oversample = "2x";
        this.mixBus.connect(this.finalShaper).connect(this.output);

        this.cvSource = ctx.createConstantSource();
        this.cvSource.offset.value = cv;
        this.cvSource.start();

        const n = CHANNEL_BASE_FREQS.length;
        this.channels = [];
        const linkSends = [];

        for (let i = 0; i < n; i++) {
            const baseFreq = CHANNEL_BASE_FREQS[i];

            const ambientGain = ctx.createGain();
            ambientGain.gain.value = 0.003;
            this.ambientLowpass.connect(ambientGain);

            const input = ctx.createGain();
            ambientGain.connect(input);

            // Persistent square oscillator: pitched body of the hit, muted
            // (gain 0) until trigger() briefly gates it open.
            const osc = ctx.createOscillator();
            osc.type = "square";
            osc.frequency.value = baseFreq;
            osc.start();
            const oscGate = ctx.createGain();
            oscGate.gain.value = 0;
            osc.connect(oscGate).connect(input);

            const resonator = ctx.createBiquadFilter();
            resonator.type = "bandpass";
            resonator.frequency.value = baseFreq;
            resonator.Q.value = RESONANCE_Q;
            // Idle ambient floor bleeds through here at a constant, low
            // level — the channel's own always-audible "life" — separate
            // from the gated, explicitly-enveloped hit path below.
            const ambientTap = ctx.createGain();
            ambientTap.gain.value = 0.15;
            resonator.connect(ambientTap);

            // CV modulates both this channel's pitch/oscillator stability
            // (proportional to its own base frequency, not a flat Hz
            // offset — a flat offset is inaudible on a high channel and
            // destabilizing on a low one) and, via driveGain below, how
            // hard the signal is slammed into distortion.
            const driftMod = ctx.createGain();
            driftMod.gain.value = baseFreq * 0.5;
            this.cvSource.connect(driftMod);
            driftMod.connect(resonator.frequency);
            driftMod.connect(osc.frequency);

            // Drive stage: a fixed waveshaper curve clips harder the hotter
            // its input is, so this pre-gain (not the curve itself) is what
            // CV rides to go from mildly warm to heavily clipped/gritty. Low
            // enough at rest (0.6) that the curve isn't already saturated
            // before CV gets involved — a driveGain that starts too hot
            // makes CV's whole range land in the curve's flat saturated
            // zone, audible as almost no difference between low and high CV.
            const driveGain = ctx.createGain();
            driveGain.gain.value = 0.6;
            const driveMod = ctx.createGain();
            driveMod.gain.value = 4.5;
            this.cvSource.connect(driveMod).connect(driveGain.gain);

            const shaper = ctx.createWaveShaper();
            shaper.curve = buildDistortionCurve(55);
            shaper.oversample = "2x";

            // Bit-reduction curve is rebuilt per-trigger (see trigger()) so
            // its step count itself tracks CV — a WaveShaperNode's curve has
            // no AudioParam to ride continuously, but rebuilding a 1024-
            // sample array per hit is cheap even at self-glitch densities.
            // This is what keeps CV's effect on grit audible independent of
            // the drive stage above, which alone saturates too fast to
            // carry that whole range on its own.
            const bitcrush = ctx.createWaveShaper();
            bitcrush.curve = buildBitcrushCurve(12);

            resonator.connect(driveGain).connect(shaper).connect(bitcrush);

            // The hit envelope — see the class comment above for why this
            // (not the resonator's own ring, and not oscGate's own shape)
            // is what makes a hit read as a sharp click rather than a
            // sustained tone. Default 0; scheduled per-trigger.
            const hitEnvelope = ctx.createGain();
            hitEnvelope.gain.value = 0;
            bitcrush.connect(hitEnvelope);

            // A second, parallel copy of the excitation noise: highpassed
            // (so it entirely bypasses the low-tuned resonator, driveGain,
            // and shaper — it stays bright rather than getting buried/
            // muffled by the tonal path's coloring) for a broadband "snap"
            // layered under the pitched body. It still joins the shared
            // bitcrush stage, not hitEnvelope directly — this is the
            // loudest, most audible part of a hit, so if it skipped
            // bitcrush too, cv's whole effect on grit would be swamped by
            // an untouched signal and read as barely audible.
            const sizzleHighpass = ctx.createBiquadFilter();
            sizzleHighpass.type = "highpass";
            sizzleHighpass.frequency.value = 2200 + i * 150;
            const sizzleGain = ctx.createGain();
            sizzleGain.gain.value = 0.7;
            sizzleHighpass.connect(sizzleGain).connect(bitcrush);

            const channelOut = ctx.createGain();
            channelOut.gain.value = 0.6;
            ambientTap.connect(channelOut);
            hitEnvelope.connect(channelOut);
            channelOut.connect(this.mixBus);

            // Cross-channel "linking": a small share of this channel's own
            // output (idle bleed AND hit energy alike) feeds the next
            // channel's input, wrapping 8 -> 1. A DelayNode is required
            // here, not optional — Web Audio only permits a cycle in the
            // graph when a node with inherent delay sits somewhere in the
            // loop (a pure-gain cycle is undefined behavior); the
            // ~10-20ms delay doubles as a subtle rhythmic smear rather
            // than a clean echo.
            const linkSend = ctx.createGain();
            linkSend.gain.value = link;
            const linkDelay = ctx.createDelay(0.05);
            linkDelay.delayTime.value = 0.008 + i * 0.0015;
            channelOut.connect(linkSend).connect(linkDelay);
            linkSends.push(linkSend);

            this.channels.push({ input, resonator, osc, oscGate, sizzleHighpass, hitEnvelope, bitcrush, baseFreq, linkDelay });
        };

        // Wire each channel's linkDelay into the *next* channel's input now
        // that every channel exists.
        for (let i = 0; i < n; i++) {
            this.channels[i].linkDelay.connect(this.channels[(i + 1) % n].input);
        };

        this.params = {
            cv: new NLLCParam(this.cvSource.offset, { min: 0, max: 1 }),
            // Fans out across all 8 linkSend gains — same pattern (and same
            // limitation: ramping/automation only animates the "primary",
            // index-0 node) as NLLCDelay's multi-node `time`/`feedback`.
            link: new NLLCParam(linkSends[0].gain, {
                min: 0, max: 1,
                onSet: (value) => { for (const g of linkSends) g.gain.value = value; },
            }),
        };

        // Absolute (non-loop-relative) beat of the next slot the idle
        // self-glitch loop rolls the dice on — see generateEvents/
        // onClockStart, same seeding rule as NLLCRandomNotes' own cursor.
        this._nextGlitchBeat = undefined;

        // Makes this synth its own event destination: NLLCClock already
        // knows how to deliver an event-generating unit's generateEvents()
        // output somewhere (see clock.js, built for a modulator patched
        // into a track's .notes) — it just calls
        // `destination.source.trigger(...)` on whatever's in
        // eventDestinations. A synth exposes both `.source`-shaped access
        // (via this one-line self-wrapper) and `.active`/`.trigger()`
        // directly, so pointing it at itself makes the clock self-trigger
        // this synth every tick with zero changes to clock.js — the exact
        // "runs continuously" behavior the real Noon's constant gate
        // chatter has, reusing the established generator contract rather
        // than inventing a second one.
        this.eventDestinations = [{ source: this }];
    };

    // Called by NLLCClock once per tick per absolute beat range (see
    // clock.js/randomnotes.js) — rolls the dice on a fixed grid for whether
    // the circuit "self-fires" a channel, the way real analog instability
    // would chatter even without a deliberate button push. At cv=0 this is
    // near-silent (an idle circuit); by cv=1 it's firing on most grid slots.
    generateEvents(fromBeat, toBeat) {
        if (this._nextGlitchBeat === undefined) this._nextGlitchBeat = fromBeat;

        const cv = this.params.cv.get();
        const probability = Math.min(0.9, cv * 0.9);

        const events = [];
        while (this._nextGlitchBeat < toBeat) {
            if (Math.random() < probability) {
                const pitch = Math.floor(Math.random() * this.channels.length);
                const velocity = 0.4 + Math.random() * 0.6;
                // Biased short — mostly clicks, the occasional longer one.
                const duration = 0.0625 + Math.random() * 0.25;
                events.push(new NLLCEvent({ beat: this._nextGlitchBeat, pitch, velocity, duration }));
            }
            this._nextGlitchBeat += GLITCH_GRID_BEATS;
        }
        return events;
    };

    // Duck-typed, like NLLCRandomNotes' own — a clock (re)start rewinds
    // absolute beats to 0, so the candidate cursor must reseed off the
    // first post-restart generateEvents() range.
    onClockStart() {
        this._nextGlitchBeat = undefined;
    };

    // event.pitch (0-7, wrapping) selects which channel gets "pushed";
    // event.duration is gate length in beats. oscGate/clickGain are just
    // simple on/off pulses feeding raw excitation into the resonator/sizzle
    // paths — the audible shape is entirely owned by hitEnvelope below, not
    // by these or by the resonator's own (otherwise uncontrolled) ring.
    trigger(time, event, secondsPerBeat) {
        const ctx = this.audioContext;
        const n = this.channels.length;
        const index = (((event.pitch ?? 0) % n) + n) % n;
        const ch = this.channels[index];
        const gateSeconds = Math.max(0.01, event.duration * secondsPerBeat);
        const velocity = event.velocity;

        // Rebuilds this hit's bit-crush curve from the current cv value —
        // see the constructor comment on `bitcrush` for why this lives here
        // rather than as a continuously-modulated AudioParam. cv=0 -> 14
        // steps (mild grain), cv=1 -> 3 steps (harsh, crunchy).
        const cv = this.params.cv.get();
        ch.bitcrush.curve = buildBitcrushCurve(Math.max(3, Math.round(14 - cv * 11)));

        ch.oscGate.gain.cancelScheduledValues(time);
        ch.oscGate.gain.setValueAtTime(velocity, time);
        ch.oscGate.gain.setValueAtTime(0, time + gateSeconds + 0.05);

        // A short, punchy noise burst (well under CLICK_SECONDS) — the raw
        // transient at the very front of the hit; the resonator/oscillator
        // carry the rest of the hitEnvelope's decay after this cuts off.
        const clickBurstSeconds = Math.min(0.02, gateSeconds);
        const click = ctx.createBufferSource();
        click.buffer = this._noiseBuffer;
        click.loop = true;
        const clickGain = ctx.createGain();
        clickGain.gain.setValueAtTime(velocity, time);
        clickGain.gain.setValueAtTime(0, time + clickBurstSeconds);
        click.connect(clickGain);
        clickGain.connect(ch.input);
        clickGain.connect(ch.sizzleHighpass);
        click.start(time);
        click.stop(time + clickBurstSeconds + 0.05);

        // The hit envelope: fast attack, decay capped at CLICK_SECONDS
        // regardless of gate length — this is what makes a hit read as a
        // sharp click rather than a sustained tone. Only a gate held
        // longer than that gets a quieter drone tail appended afterward
        // (matching the real unit's documented "held gates... provide
        // sustained drones" — but as an addition to the initial click, not
        // instead of it).
        // The hit's own peak also scales with cv (on top of the drive/
        // bitcrush grit above) — the downstream safety limiter compresses
        // everything toward a similar ceiling regardless of how hot the
        // per-channel processing runs, which was quietly cancelling out
        // most of that grit modulation's audible effect. A direct level
        // difference here is what actually survives that limiter as a
        // clearly audible "quiet/tame at low cv, loud/aggressive at high
        // cv" difference, not just a subtle timbral shift.
        const hitPeak = 0.5 + cv * 0.9;
        const clickLength = Math.min(gateSeconds, CLICK_SECONDS);
        ch.hitEnvelope.gain.cancelScheduledValues(time);
        ch.hitEnvelope.gain.setValueAtTime(0, time);
        ch.hitEnvelope.gain.linearRampToValueAtTime(hitPeak, time + 0.001);
        ch.hitEnvelope.gain.exponentialRampToValueAtTime(0.0001, time + clickLength);
        if (gateSeconds > clickLength + 0.02) {
            const tailPeak = hitPeak * 0.35;
            ch.hitEnvelope.gain.setValueAtTime(0.0001, time + clickLength);
            ch.hitEnvelope.gain.linearRampToValueAtTime(tailPeak, time + clickLength + 0.01);
            ch.hitEnvelope.gain.setValueAtTime(tailPeak, time + gateSeconds - 0.02);
            ch.hitEnvelope.gain.exponentialRampToValueAtTime(0.0001, time + gateSeconds + 0.05);
        }

        // "Circuit loading": the longer the gate, the further the resonant
        // frequency (and the oscillator's own pitch) drift before settling
        // back — a cheap stand-in for the real circuit's power-loading
        // pitch/texture behavior.
        const drift = ch.baseFreq * 0.1 * (Math.random() * 2 - 1);
        ch.resonator.frequency.cancelScheduledValues(time);
        ch.resonator.frequency.setValueAtTime(ch.baseFreq, time);
        ch.resonator.frequency.linearRampToValueAtTime(ch.baseFreq + drift, time + gateSeconds);
        ch.resonator.frequency.exponentialRampToValueAtTime(ch.baseFreq, time + gateSeconds + 0.4);

        ch.osc.frequency.cancelScheduledValues(time);
        ch.osc.frequency.setValueAtTime(ch.baseFreq, time);
        ch.osc.frequency.linearRampToValueAtTime(ch.baseFreq + drift * 1.5, time + gateSeconds);
        ch.osc.frequency.exponentialRampToValueAtTime(ch.baseFreq, time + gateSeconds + 0.4);
    };

    // The ambient noise loop, the 8 per-channel oscillators, and the cv
    // ConstantSource are persistent, started once in the constructor —
    // unlike every other synth here, which only ever builds one-shot nodes
    // inside trigger(). Called by NLLC.removeTrack/setTrackSynth
    // (duck-typed, like NLLCRandomNotes' own dispose()) so they don't keep
    // running forever, disconnected but still alive, after this synth is
    // torn down or swapped out.
    dispose() {
        this.ambientNoiseSource.stop();
        this.cvSource.stop();
        for (const ch of this.channels) ch.osc.stop();
    };
};
