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
| `audioin` | live input (mic, interface inputs) as a track: effects, sends, and a `loudness` source. Ignores notes. `monitor=off` = analyse without hearing | `trim` | `device` (name fragment) `channels` (`1` or `1,2`) `monitor` |
| `czsynth` | Casio CZ-101 phase distortion. 28 Boards of Canada tones ship as presets; `dcw` is the brightness knob. | `dcw` `env_time` `detune` `vib_depth` `vib_rate` `pitch_env` `key_follow` | `preset` `wave` `lines` `mod` `octave` |

| `fmperc` | AE machine FM percussion: 2-op FM, separate amp/index envelopes (bells, wood, metal clicks) | `harm` `index` `a_dec` `i_dec` `curve` `drive` `fold` `down` `pitch` `keytrk` `n_tmbr` `level` | `lane` `sieve` `quant` |
| `modal` | AE modal voice: 8 resonators struck by noise; `material` morphs drum→bell→metal ratios, `damp` = realism | `material` `inharm` `disp` `decay` `damp` `bright` `pitch` `keytrk` `n_tmbr` `drive` `fold` `level` | `lane` `sieve` `quant` |
| `drone` | AE sustaining drone: 3 detuned saws → LP/BP/HP filter; notes retrigger it by chance (`trig`), `rebirth` jumps octave | `trig` `rebirth` `pitch` `detune` `wave` `fmode` `cutoff` `res` `lfo_rt` `lfo_dp` `comb` `compand` `att` `rel` `oct` `drive` `level` | `lane` `sieve` `quant` `hold` |
| `noisehat` | AE hats: noise → one low + two high bands | `low` `hi1` `hi2` `lowq` `hiq` `mix` `decay` `curve` `level` | `lane` `sieve` |
| `subdrum` | AE sub: falling sine + click + random spike; `chtime` is the character | `pitch` `chirp` `chtime` `attack` `decay` `click` `cfreq` `cdecay` `spike` `sfreq` `sdecay` `drive` `cut` `width` `level` | `lane` `sieve` |
| `twostring` | AE string: two coupled Karplus-Strong strings (pick, stiffness, tension, sitar scatter) | `pitch` `bright` `decay` `pick` `stiff` `tension` `couple` `scatter` `drive` `keytrk` `n_tmbr` `level` | `lane` `sieve` `quant` |
| `metalbass` | AE metal bass: sub sine + 4-mode metal, comb, ring mod, own ping-pong delay | `pitch` `material` `stretch` `sub_dcy` `met_dcy` `drop` `comb` `formant` `rm_mix` `drive` `width` `d_time` `d_fb` `d_sprd` `d_wet` `level` | `lane` `sieve` `quant` |
| `crack` | AE rim/clap/snare: 1-4 noise bursts (`cracks`), tuned body, snare `rattle` | `cracks` `spread` `nse_dcy` `tone` `q` `body` `pitch` `bdy_dcy` `rattle` `width` `drive` `level` | `lane` `sieve` `quant` |
| `foldkick` | AE kick: one oscillator, pitch sweep, wavefold body, sub, compressor. Pitch in Hz | `pitch` `chirp` `chtime` `attack` `punch` `decay` `body` `sub` `noise` `boost` `comp` `level` | `lane` `sieve` `wave` |
| `bassdrum` | AE voce-1 bass drum: inharmonic, non-ringing, every hit varies; own rumble reverb + lossy degradation. `dice=random` rerolls | `rvb` `tune` `sweep` `decay` `knock` `dirt` `lsy` `freq` `pack` `vary` `level` | `lane` `sieve` `lsy_mode` `dice` |
| `bigmodal` | AE Big Modal: a struck disc solved from physics (16 Bessel modes, 25 materials incl. impossible ones, strike position, chaotic mod rows). `/x` prints f1, wave speed, f16/f1 | `morph` `radius` `thick` `tension` `stretch` `damp_tilt` `contact_r` `contact_theta` `couple` `drift` `grime` `bite` `grain` `oct` `hit` `mix` `out_db` `rate` `spread` `wander` | `mat_a` `mat_b` `preset` `mod_<contact_r\|contact_theta\|tension\|couple\|grime\|morph>` (`chaos\|vel\|note:<amt>[:run]`) `lane` `sieve` |
| `tapedrone` | AE tape pad: free-running 432Hz chord that drifts only in colour; **ignores notes**, plays while its track is started | `root` `tune` `voices` `spread` `drift` `glide` `wow` `flut` `wash` `dark` `hiss` `breath` `att` `rel` `sat` `width` `hp` `level` | — |
| `microsampler` | AE samplers 2-4: note 48 = original pitch; `mod=on` micro-loops where velocity is loop length | `attack` `decay` `start` `loop_start` `loop_end` `slices` `chaos` `loop_min` `loop_max` `level` | `sample` `folder` `mod` `loop` `vel_invert` `vel_jump` `lane` |
| `slicer` | AE slice sampler: a continuously looping window over an onset-sliced file; each step relocates it (`dev_*`) | `rate` `start` `end` `window` `declick` `slice` `dev_slice` `dev_rate` `dev_end` `dev_window` `level` | `sample` `folder` `thresh` `min_hop` `mod` |
| `multicluster` | AE multicluster: one timbre family (k-means) of a sliced file; one track per `cluster`, same `sample`+`seed` | `rate` `attack` `release` `level` | `sample` `folder` `clusters` `cluster` `seed` `thresh` |

The AE voices listen on a **lane** and a **sieve**: a note from `markovseq` carries its lane (1-6) and each voice plays it only if `note mod d = r` (defaults: fmperc 4:0, modal 3:1, drone 4:2, noisehat 4:3, subdrum 5:4, twostring 6:5, metalbass 8:1, crack 7:3 on lane 5; bassdrum lane 1; microsampler 2; foldkick even / bigmodal odd on 6). Notes from anything else carry no lane and always play.

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
| `deeppad` | AE deep pad: 10 self-excited resonators on a **bus**; `excite` makes whatever is sent in strike them (a tunable convolution) | `pitch` `oct` `descent` `inharm` `partials` `sub` `tilt` `spread` `drift` `decay` `erode` `grey` `wind` `vinyl` `tone` `q` `space` `dist` `damp` `excite` `att` `sat` `hp` `level` | `restart` |
| `resonators` | AE: 4 tuned strings ringing their input on a scale; also the tuning the jumpers use | `decay` `damp` `inharm` `root` `prob` `mix` | `scale` |
| `cascade` | AE: delay with a pitch shifter in the loop — echoes fall/climb by `shift` semitones | `time` `shift` `feedback` `win` `damp` `xfb` `spread` `reson` `rfreq` `drive` `morph` `mix` | — |
| `notverb` | AE: FDN reverb that freezes (`freeze=on` holds forever) | `size` `decay` `damp` `mix` | `freeze` |
| `glaze` | AE: 6 grains from the last 6 s of input; `feed` builds a drone that outlives the music | `size` `density` `scatter` `spray` `motion` `octave` `feed` `mix` | — |
| `drivenet` | AE drive: 4 folded delay lines at irrational ratios | `time` `feedback` `damp` `drive` `cross` `noise` `width` `mix` `out` | — |
| `spectra` | AE: photographs 12 partials; robot vocoder + sympathetic strings. You never hear the input | `rate` `snap` `jump` `thresh` `decay` `ring` `tight` `sink` `bloom` `feed` `grime` `damp` `robo` `oct` `tilt` `width` `wash` `mix` | `photo` (`now` takes one) |
| `lossyverb` | AE LSYX: reverb like a failing codec (kbps 320..8, packet loss, tails grind away) | `kbps` `pack` `verb` `spc` `tone` `duck` `width` `mix` | `freeze` |
| `breathe` | AE: 3-band compressor with a duck per band; patch drums into `key` (`/patch source=kick dest=breathe.key depth=1`) | `x_lo` `x_hi` `thr` `ratio` `depth` `attack` `release` `duck_lo` `duck_mid` `duck_hi` `d_rel` `out` `key` | — |
| `microdelay` | AE: tuned stutter comb that bursts on hits | `tap` `fb` `stut` `burst` `scat_l` `scat_r` `reso` `tone` `crush` `level` `dry` | — |
| `looper` | AE: 30 s circular looper; playhead can follow drawn curves | `speed` `start` `length` `xfade` `ovr_fbk` `level` `depth` `morph` `monitor` | `rec` `play` `clear` `curve_a` `curve_b` |
| `oxide` | AE: tape transport after the looper — `spool`, `wear`+`disint=on` wears the tape away for good; spring tank | `spool` `wear` `wow` `sat` `tone` `hiss` `trim` `spring_mix` `size` `color` | `tape` `disint` `spring` |

## Modulators — `/add_modulator type=<x> name=<n>`

Patch into a **parameter** (`dest=svf.cutoff`, needs `depth=`):

| Type | What it is | params | options |
|---|---|---|---|
| `lfo` | continuous bipolar −1..1 signal at a given rate | `freq` | `waveform` |
| `cv` | a single held value you set, ramp or automate — a manual offset / sample-and-hold | `value` | — |
| `modlfo` | AE per-param modulator: sine/triangle/sawup/sawdown/square/sh/drift, synced (`div`) or free (`hz`); `sh` re-rolls each time `strike=<name>` fires (a track's note, a loudness onset, a key) | `hz` | `shape` `sync` `div` `strike` |
| `attractor` | chaotic source (coullet/lorenz/rossler) at audio rate; `strike=<name>` pushes its speed | `rate` `wander` | `system` `axis` `strike` |
| `loudness` | envelope follower on `source=<track/bus/master>` (e.g. an audioin): **fires** each time the level crosses `threshold` dBFS; output is a gate impulse or (`mode=envelope`) the level | `threshold` `hold` `release` `width` | `source` `mode` |
| `midicc` | one MIDI knob/fader/pedal (`cc=0-127` or `pitchbend`) as 0..1; fires crossing the middle | `smooth` | `device` `channel` `cc` |
| `curveloop` | AE shapes: a drawn curve looping on a musical length | `rate` `min` `max` `auto` `npoints` `jump` | `points` `div` `mult` `rnd` `clr` |

Patch into a **track's notes** (`dest=<track>.notes`, no `depth=`):

| Type | What it is | params | options |
|---|---|---|---|
| `randomnotes` | re-rolls continuously — or, with `trigger=<name>`, once each time that object fires (a loudness onset → a random scale note) | `probability` `min_gap` | `scale` `trigger` |
| `midiin` | a MIDI keyboard: keys held until released, sustain pedal, velocity; its signal outlet is one `cc` (mod wheel) | `length` `release` `transpose` | `device` `channel` `cc` |
| `markovpercs` | generates one fixed pattern and loops it until reseeded | `velocity` `swing` | `style` `seed` `steps` `step_beats` `density` `per_category` |
| `euclidpercs` | euclidean rhythms | `velocity` `swing` `dropout` | `preset` `steps` `step_beats` `variation` `seed` `per_category`, and `<cat>`/`<cat>_rotate` for each of `kicks` `snares` `hats` `percs` |
| `patternvariator` | loads a hand-written pattern from `/patterns` and transforms it | `velocity` `swing` | `pack` `pattern` `seed` `variation` `density` `step_beats` `transpose` `per_category` |
| `pianoroll` | a hand-written note pattern on its own loop, played by every track patched to it (one part, several instruments); edit with add_event/set_events like a track | `velocity` | `notes` `length` |
| `chorale` | overlapping sustained voices through a chord progression | `velocity` `note_beats` `overlap` `spread` `stagger` | `mode` `progression` `chord_size` `stack` `chord_beats` `transpose` `voices` |
| `markovseq` | AE sequencer: 16 steps × 11 columns walked through a 16×16 Markov matrix; stamps each note with a lane so AE voices' sieves orchestrate. Patch into every AE voice | `inject` | `trig` `note` `vel` `shift` `metrics` `ratchet` `ssize` `ratprob` `swing` `prob` `micro` (16 values each), `matrix` `shape` `rewrite` `every` `density` `morph` `animate` `weights` `dispatch` `seed` |

Needs **no patch** — acts on objects directly:

| Type | What it is | params | options |
|---|---|---|---|
| `randomgestures` | roams the live session gliding random parameters to new values; a seeded self-playing hand on the controls | `gesture_beats` `glide` `depth` `probability` | `seed` `scope` `targets` `params` |
| `dicejumpers` | AE probability jumpers: `dice`% per step every targeted effect jumps its own way (tuned delay times, timed freezes); `listen=<markovseq>` also fires on note injections | `dice` `step_beats` | `targets` `probs` `listen` `seed` |
| `elastictempo` | AE elastic tempo: episodes glide the session bpm (sparse/accel/brake/relaunch) onto 1/2..2× plateaus | `amt` `epoch` `prob` `grid` `len` | `on` `base_bpm` `fire` `seed` |
| `terrarium` | AE Terrarium: Lorenz agents grab params anywhere, move them, give them back (`hold=on` keeps changes); can shuffle a markovseq | `rho` `wanderers` `depth` `speed` `hold_min` `hold_max` `grab` `scramble` `safety` `glide` `balance` `fx_wt` `sh` | `mode` `hold` `targets` `shuffle` `shuffle_cols` `coupled` `seed` `panic` `reset` |
| `driftbank` | AE FX banks / pan drift: each target's send into `bus` (or pan) drifts on its own | `rate` `jump` `depth` | `kind` `bus` `targets` `mode` `seed` |
| `fbmatrix` | AE feedback matrix: routes effect buses into each other (safe: zero diagonal, rows sum to 1, cutout) | `depth` `rot` `g` `drive` `hp` `damp` `dtime` `mute` `sec` | `buses` `auto` `dice` `seed` |

## Hardware outputs — the audio interface

`/devices` lists audio outputs/inputs and MIDI inputs. `/master device=<name fragment>`
plays through another interface (e.g. `scarlett`); `/master channels=3,4` moves
master's hardware outputs. `/add_output name=<n> channels=3,4` (or one channel, `5`)
makes another destination: `/<track> out=<n>` or `add_send=<n>`. `/outputs` lists
the routing; an output past the device's channel count is silent and says so.
