# Types

`params` are numeric: rampable, patchable, automatable. `options` are discrete
settings (strings, lists, seeds) — set the same way but they never ramp, and a
bare `random` skips them. Both are set through the owning object's name.

Lists below are complete and verified against the live engine. Use
`/<name> help` for ranges and defaults.

## Synths — `/add_track name=<n> synth=<x>` or `/<track> synth=<x>`

| Type | What it is | params | options |
|---|---|---|---|
| `oscsynth` | one oscillator per note into a gain envelope. The default. | — | `waveform` (sine/square/sawtooth/triangle) |
| `sampler` | fixed sample slots; an event's `pitch` picks a slot, wrapping | — | `samples` |
| `percsampler` | drum kit: kicks/snares/hats/percs × `per_category` slots, filled at random. `pitch` picks a slot. Humanizes every hit. | `dynamics` `pan_spread` `speed_spread` | `samples` `per_category` `categories` |
| `karplus` | polyphonic plucked string (noise burst → feedback delay). Chords and melodies. | `damping` `decay` `brightness` | `excitation` |
| `granular` | one recording played as a cloud of overlapping grains. Sustained pads; plays chords. | `density` `grain_size` `spray` `position` `drift` `pitch_spread` `pan_spread` `attack` `release` | `sample` `folder` `window` `direction` `root` |
| `tapepad` | detuned voices + a shared tape stage (saturation, crush, wow/flutter, hiss). Slow warped lofi chords. | `wow` `flutter` `wow_rate` `hiss` `sat` `cutoff` `detune` `pan_spread` `sub` `attack` `release` | `waveform` `voices` `bits` |
| `chaossynth` | two cross-coupled feedback voices. A seed gives every MIDI note its own configuration — **a note picks a timbre, not a pitch**. | `a_cross` `a_drive` `a_pitch` `a_res` `a_track`, `b_` × the same five, `spread` `pitch_track` `attack` `release` | `seed` `output` |
| `czsynth` | Casio CZ-101 phase distortion. 28 Boards of Canada tones ship as presets; `dcw` is the brightness knob. | `dcw` `env_time` `detune` `vib_depth` `vib_rate` `pitch_env` `key_follow` | `preset` `wave` `lines` `mod` `octave` |

Note `tapepad`'s `cutoff` and `sat` are **params** (so they ramp), and `sat`
starts at 1 — `sat=1` is no saturation, not silence.

## Processors — `/<channel> add_processor=<x>`

| Type | What it is | params | options |
|---|---|---|---|
| `reverb` | convolution against a generated impulse, added on top of dry | `wet` | `duration` `decay` |
| `delay` | ping-pong: L/R delay lines, cross-feedback, slight offset for width | `time` `feedback` `wet` | `stereoOffset` |
| `compressor` | with a wet mix — turn `mix` down for parallel compression | `threshold` `ratio` `attack` `release` `knee` `makeup` `mix` | — |
| `saturator` | drive into one of four curves, tape warmth → wavefolder | `drive` `level` `mix` | `character` `oversample` |
| `tilt` | one control trading lows against highs around a pivot | `tone` `pivot` | — |
| `svf` | state-variable filter, read out as LP/HP/BP/notch | `cutoff` `resonance` `mix` | `mode` |
| `comb` | signal + a very short delayed copy. Feedforward = notches/flanger, feedback = ringing resonator | `time` `feedback` `tone` `mix` | `mode` |
| `limiter` | boost into a fast high-ratio compressor holding a ceiling | `boost` `ceiling` `release` | — |
| `goodenizer` | the whole chain in one box: compressor → saturator → tilt → limiter. Makes anything louder and more even; raise `drive` for dirt. | `threshold` `ratio` `attack` `release` `makeup` `drive` `tone` `pivot` `ceiling` `mix` | `character` `oversample` |

## Modulators — `/add_modulator type=<x> name=<n>`

Patch into a **parameter** (`dest=svf.cutoff`, needs `depth=`):

| Type | What it is | params | options |
|---|---|---|---|
| `lfo` | continuous bipolar −1..1 signal at a given rate | `freq` | `waveform` |
| `cv` | a single held value you set, ramp or automate — a manual offset / sample-and-hold | `value` | — |

Patch into a **track's notes** (`dest=<track>.notes`, no `depth=`):

| Type | What it is | params | options |
|---|---|---|---|
| `randomnotes` | re-rolls continuously | `probability` `min_gap` | `scale` |
| `markovpercs` | generates one fixed pattern and loops it until reseeded | `velocity` `swing` | `style` `seed` `steps` `step_beats` `density` `per_category` |
| `euclidpercs` | euclidean rhythms | `velocity` `swing` `dropout` | `preset` `steps` `step_beats` `variation` `seed` `per_category`, and `<cat>`/`<cat>_rotate` for each of `kicks` `snares` `hats` `percs` |
| `patternvariator` | loads a hand-written pattern from `/patterns` and transforms it | `velocity` `swing` | `pack` `pattern` `seed` `variation` `density` `step_beats` `transpose` `per_category` |
| `pianoroll` | a hand-written note pattern on its own loop, played by every track patched to it (one part, several instruments); edit with add_event/set_events like a track | `velocity` | `notes` `length` |
| `chorale` | overlapping sustained voices through a chord progression | `velocity` `note_beats` `overlap` `spread` `stagger` | `mode` `progression` `chord_size` `stack` `chord_beats` `transpose` `voices` |

Needs **no patch** — acts on objects directly:

| Type | What it is | params | options |
|---|---|---|---|
| `randomgestures` | roams the live session gliding random parameters to new values; a seeded self-playing hand on the controls | `gesture_beats` `glide` `depth` `probability` | `seed` `scope` `targets` `params` |
