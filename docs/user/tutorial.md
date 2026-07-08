# Tutorial

NLLC is a live-coding environment: you type slash-commands into a console, and they
create and control tracks (synths/samplers), processors (effects), and the master
output, all playing in a loop against a shared clock — like a very small, text-driven
Ableton/Max-MSP.

## Running it

```sh
npm install
npm run dev -- --open
```

Open `/code-editor`. You'll see two panes: a text console on the left, a mixer on the
right (with a collapse arrow between them, and a drag-to-resize handle).

## Your first sounds

The app starts with one demo track already set up (`track_1`, an oscillator synth
with a reverb insert and a short rising arpeggio, fading in over the first few
beats) but the engine itself is off. Type into the console and press Enter to run
a command:

```
/start
```

You should hear `track_1`'s arpeggio loop, fading in. The mixer's master strip (far
right) will show the power light pulsing on each loop and a level meter.

Now add a drum track:

```
/add_track name=drums synth=sampler
```

This creates a second track using the sample-based synth instead of the default
oscillator — every track loops independently against the same clock. A fresh
track's synth always starts with **no events**, so `drums` is silent until you
author a pattern onto it (next section).

## Authoring events

Every track's synth has an event list you build up with `add_event`. For a
`sampler`, `pitch` selects a slot (0 = first sample, wrapping if out of range):

```
/drums add_event beat=0 pitch=0 velocity=0.9 duration=0.25
/drums add_event beat=1 pitch=2 velocity=0.8 duration=0.25
/drums add_event beat=2 pitch=0 velocity=0.9 duration=0.25
/drums add_event beat=3 pitch=2 velocity=0.8 duration=0.25
```

That's a basic four-on-the-floor kick/snare pattern (`pitch=0`/`pitch=2` are the
first two sample slots — see [objects.md](objects.md) for the full slot list).
Every field but `beat` is optional. For `oscsynth`, use `pitch=<midi note>` for a
raw pitch, or `degree=<n>` to use a scale-degree resolved against the shared
harmony context instead (see [objects.md](objects.md#events)):

```
/track_1 add_event beat=0 degree=0 velocity=0.6 duration=0.5
/track_1 add_event beat=2 degree=4 velocity=0.6 duration=0.5
```

Clear a track's pattern entirely with `/drums clear_events`.

## Tempo and loop length

The whole pattern loops over a fixed number of beats at a given tempo — both
adjustable at runtime with `/clock`:

```
/clock
```
```
bpm=120 num_beats=4
```

```
/clock bpm=140
/clock num_beats=8
```

Changing `num_beats` while the engine is running can shift where the loop
boundary currently falls — an accepted live-coding glitch, not a bug.

## Controlling tracks

Every track (and the master channel) is addressable by name. With no parameters, a
channel command just prints its current status:

```
/track_1
```
```
track_1 — gain=0.80 pan=0.00 inserts=[p1:reverb] synth=oscsynth("A basic subtractive synth voice...")
```

Set gain (0–1) and pan (-1 to 1):

```
/drums gain=0.6
/drums pan=-0.3
```

Pause and resume a single track without touching anything else (its events just stop
being scheduled — already-sounding notes finish naturally):

```
/drums stop
/drums start
```

List every track at once:

```
/tracks
```

## Ramps

Add a trailing duration to `gain=`/`pan=` (or any processor param, see
[Effects](#effects) below) to ramp instead of jumping instantly:

```
/drums gain=0 3        fade drums out over 3 seconds
/drums gain=0.6 4b      fade back in over 4 beats ("b" = beats, no suffix = seconds)
```

By default a ramp starts the instant you hit Enter. Add `at=beat` or `at=cycle`
to line it up with the next beat or the next loop boundary instead — handy for
keeping changes musically in time rather than landing mid-phrase:

```
/drums gain=0 4b at=cycle
```

You can also fire several commands from one line, all together:

```
/track_1 gain=0 8 /drums gain=0 8
```

## Effects

Attach a processor to a track's insert chain:

```
/drums add_processor=delay
```

The router assigns it a default name (`delay`) and an id (e.g. `p2`), which is
addressable on its own:

```
/delay wet=0.5
/delay feedback=0.45
```

Run a processor with no arguments (or `help`) to see what it's called and which
parameters it takes:

```
/delay help
```

Bypass it without removing it by clicking its name in the mixer's insert list (each
track strip shows its inserts as small buttons — click to toggle bypass, shown with
strikethrough when off), or remove it entirely:

```
/drums remove_processor=p2
```

## The mixer

Each channel strip in the mixer mirrors and controls the same state the console
does: a vertical fader (gain, with a level meter next to it), a rotary pan dial
(click-drag vertically), and the insert-chain buttons described above. Dragging
these updates the audio graph directly — the console and mixer are just two views
onto the same `NLLC` instance, so a `/track_1 gain=0.4` and dragging that track's
fader do the same thing.

Toggle the mixer pane with the collapse arrow between the console and mixer (it
shrinks to a thin rail showing just the master power button, clock LED, and level
meter) — useful for maximizing the console when you're just typing.

## Cleaning up

```
/track_1 remove_self
/stop
```

`remove_self` works on tracks and processors (not master). `/stop` suspends the
whole audio engine; `/start` resumes it.

See [commands.md](commands.md) for the full command reference and
[objects.md](objects.md) for every synth/processor type and its parameters.
