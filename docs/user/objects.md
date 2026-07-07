# Synths and processors

## Synths (`synth=` on `/add_track` or a channel)

### `oscsynth` — `NLLCOscSynth` (default)

> A basic subtractive synth voice: single oscillator per note into a gain envelope.

One oscillator per triggered note: a short linear attack (5ms) into an exponential
decay over the note's duration.

| Constructor option | Default | Meaning |
|---|---|---|
| `waveform` | `"sawtooth"` | Any `OscillatorNode.type` value (`sine`, `square`, `sawtooth`, `triangle`). |

Seeds itself with a 4-beat rising placeholder arpeggio so a fresh instance is
audible immediately: `/add_track name=lead synth=oscsynth waveform=square`.

### `sampler` — `NLLCSampler`

> A sample player: each event's pitch selects one of a fixed set of loaded sample
> slots to trigger (0 = first slot, wrapping if out of range).

Loads a fixed set of 6 drum one-shots from `static/samples` into indexed "slots" on
construction (async, fire-and-forget — a slot that hasn't finished loading yet
silently doesn't sound if triggered):

| Slot | Sample |
|---|---|
| 0 | kick02 |
| 1 | kick03 |
| 2 | distorted snare06 |
| 3 | distorted snare07 |
| 4 | hat13 |
| 5 | hat14 |

An event's `pitch` field selects the slot (modulo the slot count, so pitch `6` wraps
to slot `0`). Seeds itself with a placeholder kick/snare/hat pattern.

## Processors (`add_processor=` on any channel)

### `reverb` — `NLLCReverb`

> A simple algorithmic reverb: convolution against a generated impulse response,
> added on top of the dry signal.

Convolves the (always-passed-through) dry signal against a synthetically-generated
impulse response — exponentially-decaying random noise, not a real-space recording.

| Constructor option | Default | Runtime param | Meaning |
|---|---|---|---|
| `duration` | `2.5`s | — | Length of the generated impulse response. Not exposed as a runtime param — set at creation only. |
| `decay` | `3` | — | Exponent controlling how fast the impulse response decays. Creation-only. |
| `wet` | `0.3` | `wet` | Wet-signal mix level (0–1). |

### `delay` — `NLLCDelay`

> A stereo delay: independent left/right delay lines with cross-feedback
> (ping-pong) and a small time offset between channels for width.

Dry signal always passes through; the wet path splits to independent L/R delay
lines that feed back into *each other* (ping-pong) rather than themselves.

| Constructor option | Default | Runtime param | Meaning |
|---|---|---|---|
| `time` | `0.375`s | `time` | Base delay time (right channel is offset by `stereoOffset` above this). |
| `feedback` | `0.35` | `feedback` | Cross-feedback amount (applied symmetrically to both channels). |
| `wet` | `0.3` | `wet` | Wet-signal mix level (0–1). |
| `stereoOffset` | `0.06`s | — | Extra delay time on the right channel for stereo width. Creation-only, not currently exposed as a runtime param. |

## Gain taper

Every channel's `gain=` command param is a linear 0–1 *fader position*, not a raw
gain value. It's mapped onto actual gain through an exponential taper
(`src/lib/scripts/nllc-src/taper.js`) so that equal steps in position feel like
equal steps in loudness (the ear perceives loudness roughly logarithmically) —
`gain=0.5` is not "half as loud", it's the position that sounds like the halfway
point.
