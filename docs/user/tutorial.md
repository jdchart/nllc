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
with a reverb insert, fading in over the first few beats) but the engine itself is
off. Type into the console and press Enter to run a command:

```
/start
```

You should hear `track_1`'s placeholder arpeggio loop, fading in. The mixer's master
strip (far right) will show the power light pulsing on each loop and a level meter.

Now add a drum track:

```
/add_track name=drums synth=sampler
```

This creates a second track using the sample-based synth instead of the default
oscillator, and it starts playing its own placeholder kick/snare/hat pattern
immediately — every track loops independently against the same clock.

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
