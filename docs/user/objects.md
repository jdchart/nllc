# Synths and processors

## Synths (`synth=` on `/add_track` or a channel)

### `oscsynth` — `NLLCOscSynth` (default)

> A basic subtractive synth voice: single oscillator per note into a gain envelope.

One oscillator per triggered note: a short linear attack (5ms) into an exponential
decay over the note's duration.

| Constructor option | Default | Meaning |
|---|---|---|
| `waveform` | `"sawtooth"` | Any `OscillatorNode.type` value (`sine`, `square`, `sawtooth`, `triangle`). |

Starts with **no events** — silent until you `add_event` onto it (see
[Events](#events) below): `/add_track name=lead synth=oscsynth waveform=square`
then `/lead add_event beat=0 pitch=60`. An event's `pitch` is a MIDI note
number; give `degree=` instead to use the shared harmony context.

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
to slot `0`; negative pitches wrap correctly too). Starts with **no events** —
silent until you `add_event` onto it (see [Events](#events) below). `degree=`
doesn't apply here — the sampler always reads `pitch` as a slot index, never
resolves it against the harmony context.

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

## Modulators (`type=` on `/add_modulator`)

A modulator is a standalone, continuously-running control source — created
and addressed like a processor, but it never joins any channel's chain. On
its own it does nothing audible; it only matters once patched into a
parameter with `/patch` — see [commands.md](commands.md#modulators-and-patches).

### `lfo` — `NLLCLFO` (default)

> A low-frequency oscillator: a continuous bipolar (-1..1) control signal at
> a given rate, for patching into any parameter.

| Constructor option | Default | Runtime param | Meaning |
|---|---|---|---|
| `freq` | `1`Hz | `freq` | Oscillation rate. Rampable/deferrable like any param. |
| `waveform` | `"sine"` | — | Any `OscillatorNode.type` value (`sine`, `square`, `sawtooth`, `triangle`). Creation-only. |

`/add_modulator type=lfo freq=2 name=lfo1` then `/patch source=lfo1
dest=reverb.wet depth=0.2` wobbles `reverb`'s wet mix at 2Hz.

## Events

A synth's pattern is a list of events, authored with `/track_1 add_event ...`
(see [commands.md](commands.md)) — a fresh track's synth starts with none.
Each event has:

| Field | Default | Meaning |
|---|---|---|
| `beat` | `0` | Loop-relative position (`0` to the clock's `num_beats`, see [commands.md](commands.md#top-level-commands)). |
| `pitch` | `60` if neither `pitch=` nor `degree=` given | A raw MIDI note number (`oscsynth`) or sample-slot index (`sampler`). |
| `degree` | — | A scale-degree, resolved against the shared harmony context **at the moment the note is triggered**, not when `add_event` was run. Only meaningful for `oscsynth`; `sampler` ignores it. |
| `velocity` | `1` | 0–1, used as the note's peak gain. |
| `duration` | `0.25` | In beats, not seconds — the clock converts using the current tempo at trigger time. |

The harmony context (`root`/`scale`) currently defaults to chromatic — every
semitone is in the scale — so `degree` behaves as a plain semitone offset from
`root` (MIDI 60). There's no `/harmony` command yet to change the key/scale at
runtime; that's a deferred piece of a larger scale/chord system. The point of
resolving `degree` at trigger time rather than baking in a pitch when the
event is authored is so that once real scale-switching exists, changing the
key will retune a pattern that's already scheduled and playing.

## Gain taper

Every channel's `gain=` command param is a linear 0–1 *fader position*, not a raw
gain value. It's mapped onto actual gain through an exponential taper
(`src/lib/scripts/nllc-src/taper.js`) so that equal steps in position feel like
equal steps in loudness (the ear perceives loudness roughly logarithmically) —
`gain=0.5` is not "half as loud", it's the position that sounds like the halfway
point.
