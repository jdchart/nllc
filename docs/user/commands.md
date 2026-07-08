# Command reference

## Syntax

```
/name [key=value ...]
```

- `name` is either a top-level command, or the name of an existing track, the
  master channel, a processor, or a modulator.
- A bare `key` with no `=` is a boolean flag: `/reverb help` sets `params.help = true`.
- Values are parsed automatically: `0.5` / `-2` → number, `true`/`false` → boolean,
  anything else → string. Quote a value to include spaces or force it to be a
  string: `name="lead synth"`.
- Whitespace around `=` is optional — `gain=0.5`, `gain = 0.5`, and `gain =0.5` all
  parse the same.
- A value can be followed by a bare duration to turn a set into a ramp, e.g.
  `gain=0.5 3` (over 3 seconds) or `gain=0.5 4b` (over 4 beats) — see
  [Ramps](#ramps) below.
- Several commands can be typed on one line and run together, e.g.
  `/track_1 gain=0 8 /reverb wet=0.9 6b` — the line is split on each `/name`
  it finds and every segment runs in the same call, so they schedule off the
  same instant. (This assumes no param value contains a literal `/`, which
  none currently do.)
- Every command must start with `/`; anything else is rejected without side effects.
- Errors (unknown command, bad syntax, unknown param, a value that isn't
  actually a valid number, etc.) are returned as a plain string in the
  console log rather than thrown — nothing crashes the session, and a bad
  value is rejected outright rather than silently corrupting state (e.g.
  `/clock bpm=notanumber` reports an error and leaves `bpm` untouched, rather
  than setting it to `NaN`).

## Top-level commands

| Command | Effect |
|---|---|
| `/start` | Resumes the `AudioContext` and starts the clock. |
| `/stop` | Suspends the `AudioContext` and stops the clock. |
| `/add_track [name=] [synth=] [...synth options]` | Creates a track. `name` defaults to `"track"` (de-duplicated as `track_2`, `track_3`, ... if taken — pass `name=` explicitly for a nicer name). `synth` selects the synth type (default `oscsynth`; see [objects.md](objects.md)). Any other params are passed straight to the synth's constructor (e.g. `synth=oscsynth waveform=square`). A fresh track's synth starts with **no events** — see `add_event` below. |
| `/tracks` | Lists every track's summary line (same format as running a track command with no params). |
| `/clock [bpm=] [num_beats=]` | With no params, reports the current `bpm=... num_beats=...`. `bpm=<n>` changes tempo (glitch-free while running — the current playback position is preserved); it also accepts a trailing ramp duration (`/clock bpm=140 8`, ramps tempo smoothly over 8 seconds) and `at=beat`/`at=cycle` to defer the start — see [Ramps](#ramps). `num_beats=<n>` changes the loop length in beats (defaults to 4) and is **not** rampable (a shifting loop length has no sensible meaning — a ramp spec there is rejected with a message). Both are runtime-mutable at any time. |
| `/add_modulator [type=] [name=] [...modulator options]` | Creates a modulator — a continuous control source you can patch into any parameter (see [Modulators and patches](#modulators-and-patches) below). `type` defaults to `lfo`. Any other params are passed to the modulator's constructor (e.g. `type=lfo freq=2 name=lfo1`). |
| `/modulators` | Lists every modulator's summary line (same format as running a modulator command with no params/`help`). |
| `/patch source=<name> dest=<name.param> [depth=]` | Creates a patch — see [Modulators and patches](#modulators-and-patches). |
| `/patch id=<id> [depth=]` | Adjusts an existing patch's depth (rampable, `at=` deferrable). With no `depth=`, reports the patch's summary. |
| `/unpatch id=<id>` | Removes a patch. |
| `/patches` | Lists every active patch, e.g. `x1: lfo1 -> reverb.wet (depth 0.20)`. |

## Channel commands (`/master`, or any track by name)

Run with no parameters to get a one-line summary:

```
track_1 — gain=0.80 pan=0.00 inserts=[p1:reverb] synth=oscsynth("...") (stopped)
```

`(stopped)` only appears if the track's synth has been paused via `stop`.

| Param | Effect |
|---|---|
| `gain=<0..1>` | Sets the channel's fader position (clamped, exponentially tapered onto actual output level for perceptually-even steps — see [objects.md](objects.md#gain-taper)). Rampable and `at=` deferrable — see [Ramps](#ramps). Can also be a patch destination (`track_1.gain`). |
| `pan=<-1..1>` | Sets stereo pan (clamped). Also rampable/deferrable/patchable, same as `gain=`. |
| `add_event [beat=] [pitch=\|degree=] [velocity=] [duration=]` | Appends one event to the track's synth. All fields optional (defaults: `beat=0`, `pitch=60` if neither `pitch=` nor `degree=` given, `velocity=1`, `duration=0.25`). `pitch=` is a raw MIDI note (or, for `sampler`, a slot index); `degree=` is a scale-degree resolved against the shared harmony context *at trigger time* instead — see [objects.md](objects.md#events). Not valid on master. |
| `clear_events` | Empties the track's synth's event list. Not valid on master. |
| `start` | Resumes the track's own synth (its events/automation resume being scheduled). Not valid on master. |
| `stop` | Pauses the track's own synth without touching routing or other tracks. Not valid on master. |
| `synth=<type>` | Swaps the track's synth to a new instance of `<type>` (see [objects.md](objects.md)), discarding the old one's state (including its events — re-`add_event` afterward). Not valid on master (master has no synth). Only the type is passed through this command — extra constructor options currently require creating the track fresh via `/add_track`. |
| `add_processor=<type>` | Creates a new processor of `<type>` and appends it to this channel's insert chain. Returns its assigned name and id, e.g. `added reverb (p1)`. |
| `remove_processor=<id>` | Removes the processor with that id from this channel's chain (and destroys it, along with any patch touching it). |
| `remove_self` | Removes the track entirely (and all of its inserts, and any patch touching any of them). Not valid on master. |

Multiple params can be combined in one command: `/track_1 gain=0.5 pan=-0.2`.

## Processor commands (any processor by name/id-derived name, e.g. `/reverb`, `/delay`)

Run with no parameters, or with `help`, to see its description and current
parameter values:

```
/reverb
reverb (p1): A simple algorithmic reverb: convolution against a generated impulse response, added on top of the dry signal. [wet=0.300]
```

| Param | Effect |
|---|---|
| `<param name>=<value>` | Sets that processor's parameter (see [objects.md](objects.md) for each type's params). Unknown param names are reported per-key without aborting the rest of the command. Also rampable/deferrable/patchable — see [Ramps](#ramps) and [Modulators and patches](#modulators-and-patches). |
| `remove_self` | Removes this processor from whatever channel it's inserted into (and any patch touching it). |

## Modulator commands (any modulator by name, e.g. `/lfo1`)

Work exactly like processor commands — run with no parameters, or with
`help`, to see the modulator's description and current parameter values; set
any param (rampable, deferrable, patchable, same as a processor); `remove_self`
removes it (and any patch touching it, whether it's the patch's source or —
if you've patched something *into* the modulator, e.g. FM-modulating an LFO's
own `freq` — its destination).

```
/lfo1
lfo1: A low-frequency oscillator: a continuous bipolar (-1..1) control signal at a given rate, for patching into any parameter. [freq=2.000]
```

See [objects.md](objects.md#modulators) for available modulator types and their params.

## Modulators and patches

A **modulator** is a standalone, continuously-running control source (e.g.
an `lfo`, a low-frequency oscillator) — it's created and addressed just like
a processor, but it never sits in any channel's signal chain. It only
matters once you **patch** it somewhere:

```
/add_modulator type=lfo freq=2 name=lfo1
/patch source=lfo1 dest=reverb.wet depth=0.2
```

This wobbles `reverb`'s `wet` parameter up and down at 2Hz, by up to ±0.2
around whatever its current value already is (including any ramp/pattern
automation already applied to it — the modulator adds on top, it doesn't
override). `depth` (default `1`) is how far the modulator's own `-1..1`
signal is scaled before reaching the destination — it lives on the *patch*,
not the modulator, so the same modulator can drive several destinations at
different amounts:

```
/patch source=lfo1 dest=track_1.gain depth=0.1
```

A destination is always `name.param` — `name` is any track, `master`, any
processor, or any modulator; `param` is one of that object's own params
(`gain`/`pan` for a channel, whatever `params` keys a processor/modulator
exposes, e.g. `wet`, `freq`). A source can be a modulator, but also any
object with an output signal — a track or master's post-fader level, or a
processor's post-effect signal — letting one track's level modulate another
parameter (a basic sidechain).

Every patch gets a compact id (`x1`, `x2`, ...) shown when it's created and
in `/patches`. Adjust its depth later, or remove it:

```
/patch id=x1 depth=0.5 2      ramp the depth to 0.5 over 2 seconds
/unpatch id=x1
```

Removing the modulator or either endpoint (a track, processor, or the whole
channel) automatically removes any patch that depended on it — a patch never
outlives what it was connected to.

## Ramps

Give `gain=`, `pan=`, any processor param, any modulator param, `/clock
bpm=`, or a patch's `depth=` a trailing duration to ramp to the value over
time instead of setting it instantly:

```
/track_1 gain=0 3        ramp gain to 0 over 3 seconds
/track_1 gain=0.8 4b     ramp gain to 0.8 over 4 beats (b = beats, no suffix = seconds)
/reverb wet=0.9 6b       ramps work on any processor param the same way
/lfo1 freq=10 3          ...and any modulator param
/clock bpm=140 8         ...and tempo itself
```

A ramp starts right now by default. Add `at=beat` or `at=cycle` to defer the
start to the next beat boundary or the next loop boundary instead:

```
/track_1 gain=0 3 at=beat    starts on the next beat, not immediately
/reverb wet=0.9 6b at=cycle  starts at the top of the next loop
```

`at=beat`/`at=cycle` also works on a plain (non-ramped) instant set, deferring
the jump to that boundary instead of applying it the moment you hit Enter:

```
/track_1 gain=0.9 at=beat    jumps to 0.9 exactly on the next beat
```

An unrecognized `at=` value is reported as a warning and falls back to "now"
rather than silently misbehaving or aborting the command. Combine with the
multi-command-per-line syntax (see [Syntax](#syntax)) to set several ramps off
together: `/track_1 gain=0 8 /reverb wet=0.9 6b`.

## Name collisions

Tracks, the master channel, processors, and modulators currently share one
flat command namespace (whichever the router finds first: built-ins, then
`master`, then tracks, then processors, then modulators). Names are
de-duplicated separately within each kind (a track, a processor, and a
modulator could all end up named the same thing) — avoid naming a new
object the same as an existing one of a different kind.
