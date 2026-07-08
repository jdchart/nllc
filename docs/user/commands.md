# Command reference

## Syntax

```
/name [key=value ...]
```

- `name` is either a top-level command, or the name of an existing track, the
  master channel, or a processor.
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
- Errors (unknown command, bad syntax, unknown processor param, etc.) are returned
  as a plain string in the console log rather than thrown — nothing crashes the
  session.

## Top-level commands

| Command | Effect |
|---|---|
| `/start` | Resumes the `AudioContext` and starts the clock. |
| `/stop` | Suspends the `AudioContext` and stops the clock. |
| `/add_track [name=] [synth=] [...synth options]` | Creates a track. `name` defaults to `"track"` (de-duplicated as `track_2`, `track_3`, ... if taken — pass `name=` explicitly for a nicer name). `synth` selects the synth type (default `oscsynth`; see [objects.md](objects.md)). Any other params are passed straight to the synth's constructor (e.g. `synth=oscsynth waveform=square`). A fresh track's synth starts with **no events** — see `add_event` below. |
| `/tracks` | Lists every track's summary line (same format as running a track command with no params). |
| `/clock [bpm=] [num_beats=]` | With no params, reports the current `bpm=... num_beats=...`. `bpm=<n>` changes tempo (glitch-free while running — the current playback position is preserved). `num_beats=<n>` changes the loop length in beats (defaults to 4). Both are runtime-mutable at any time. |

## Channel commands (`/master`, or any track by name)

Run with no parameters to get a one-line summary:

```
track_1 — gain=0.80 pan=0.00 inserts=[p1:reverb] synth=oscsynth("...") (stopped)
```

`(stopped)` only appears if the track's synth has been paused via `stop`.

| Param | Effect |
|---|---|
| `gain=<0..1>` | Sets the channel's fader position (clamped, exponentially tapered onto actual output level for perceptually-even steps — see [objects.md](objects.md#gain-taper)). Add a trailing duration to ramp instead of setting instantly — see [Ramps](#ramps). |
| `pan=<-1..1>` | Sets stereo pan (clamped). Also rampable, same as `gain=`. |
| `add_event [beat=] [pitch=\|degree=] [velocity=] [duration=]` | Appends one event to the track's synth. All fields optional (defaults: `beat=0`, `pitch=60` if neither `pitch=` nor `degree=` given, `velocity=1`, `duration=0.25`). `pitch=` is a raw MIDI note (or, for `sampler`, a slot index); `degree=` is a scale-degree resolved against the shared harmony context *at trigger time* instead — see [objects.md](objects.md#events). Not valid on master. |
| `clear_events` | Empties the track's synth's event list. Not valid on master. |
| `start` | Resumes the track's own synth (its events/automation resume being scheduled). Not valid on master. |
| `stop` | Pauses the track's own synth without touching routing or other tracks. Not valid on master. |
| `synth=<type>` | Swaps the track's synth to a new instance of `<type>` (see [objects.md](objects.md)), discarding the old one's state (including its events — re-`add_event` afterward). Not valid on master (master has no synth). Only the type is passed through this command — extra constructor options currently require creating the track fresh via `/add_track`. |
| `add_processor=<type>` | Creates a new processor of `<type>` and appends it to this channel's insert chain. Returns its assigned name and id, e.g. `added reverb (p1)`. |
| `remove_processor=<id>` | Removes the processor with that id from this channel's chain (and destroys it). |
| `remove_self` | Removes the track entirely (and all of its inserts). Not valid on master. |

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
| `<param name>=<value>` | Sets that processor's parameter (see [objects.md](objects.md) for each type's params). Unknown param names are reported per-key without aborting the rest of the command. Also rampable — see [Ramps](#ramps). |
| `remove_self` | Removes this processor from whatever channel it's inserted into. |

## Ramps

Give `gain=`, `pan=`, or any processor param a trailing duration to ramp to
the value over time instead of setting it instantly:

```
/track_1 gain=0 3        ramp gain to 0 over 3 seconds
/track_1 gain=0.8 4b     ramp gain to 0.8 over 4 beats (b = beats, no suffix = seconds)
/reverb wet=0.9 6b       ramps work on any processor param the same way
```

A ramp starts right now by default. Add `at=beat` or `at=cycle` to defer the
start to the next beat boundary or the next loop boundary instead:

```
/track_1 gain=0 3 at=beat    starts on the next beat, not immediately
/reverb wet=0.9 6b at=cycle  starts at the top of the next loop
```

An unrecognized `at=` value is reported as a warning and falls back to "now"
rather than silently misbehaving or aborting the command. Combine with the
multi-command-per-line syntax (see [Syntax](#syntax)) to set several ramps off
together: `/track_1 gain=0 8 /reverb wet=0.9 6b`.

## Name collisions

Tracks, the master channel, and processors currently share one flat command
namespace (whichever the router finds first: built-ins, then `master`, then
tracks, then processors). Track and processor names are de-duplicated separately,
so it's possible (if unlikely) for a track and a processor to end up with the same
addressable name — avoid naming a processor the same as a track.
