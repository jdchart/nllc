# Using the NLLC app

NLLC is a two-pane, browser-based live-coding app: a **text console** on the
left where you type slash-commands, and a **mixer** on the right that shows the
live audio graph. Both drive one shared [`ribbit`](../../../ribbit/) engine
instance.

> The **commands themselves** (`/add_track`, `/patch`, `/save_json`, …) are the
> engine's vocabulary — documented in full in the
> [ribbit command reference](../../../ribbit/docs/user/commands.md) and
> [tutorial](../../../ribbit/docs/user/tutorial.md). This page covers only the
> app around them.

## Running it

```sh
npm install     # from the workspace root, or from nllc/
npm run dev -- --open
```

This opens the homepage (`/`), which links to the session pages and holds the
audio-options panel.

## Pages

- **`/`** — homepage: a link to a blank session, a **dropdown of every saved
  session** in `static/sessions/` (each with a one-line summary of what it
  contains), and the **audio options** panel (see below).
- **`/code-editor`** — a **blank session**: nothing but the master channel.
- **`/code-editor/<name>`** — the same page, auto-loading
  `static/sessions/<name>.json` on open. Twelve ship:
  - **`demo`** — the starter session, and a combination of `euclid-ghosts` and
    `ambient-tape`: a generated drum kit (euclidean grid plus Markov ghosts)
    under two `tapepad` layers, with one hand-authored `lead` track. Framed as
    a tour of the three ways notes get scheduled — authored, derived, varied.
  - **`percs-demo`** — a four-track drum kit (kick, snare, hats, percs each on
    their own track) driven by one `markovpercs` rhythm, through reverb and
    delay buses.
  - **`euclid-demo`** — a euclidean drum grid: repeatable structure, four
    independent layers, with an LFO breathing the pattern in and out.
  - **`euclid-ghosts`** — a euclidean backbone with a Markov chain adding
    quiet off-beat ghost notes around it; the worked example of two
    generators driving one kit.
  - **`pattern-drums`** — hand-written drum patterns from
    `static/patterns/hiphopdrums/`, varied live: two `patternvariator`s over
    one split kit, one of them a 6-step hat lane phasing against the bar.
  - **`pattern-chords`** — hand-written chords and a melody on two `karplus`
    (plucked string) tracks.
  - **`granular-pad`** — three `granular` tracks playing chords out of field
    recordings from `static/samples/foley/`: a watery pad, reversed rain, and
    a shimmer an octave up, over a six-second reverb. Driven by the
    `ambientchords` pattern pack.
  - **`ambient-tape`** — three `tapepad` (warped lofi pad) layers over a
    dusty beat: chords, a shimmer an octave up and an open-fifths drone, all
    out of the `ambientchords` pack, with two LFOs showing both kinds of
    patch into a synth param.
  - **`chorale-drift`** — no rhythm at all: three `chorale` generators making
    sustained overlapping harmony (close sevenths, ninths an octave up, and a
    one-voice bass line), with one of them patched into two tracks so a
    `tapepad` and a `karplus` sing the identical voicing.
  - **`chaos-states`** — `chaossynth`, where a MIDI note selects a *timbre*
    rather than a pitch: the same synth at three `spread` settings (a
    hand-written riff, a `randomnotes`-driven wild layer, and a drone with two
    LFOs on its control points) over a euclidean kit.
  - **`cz-tapes`** — five `czsynth` tracks (a Casio CZ-101 emulation) over a
    dusty kit: authored electric-piano stabs, a flute melody and a bassline,
    plus a `chorale`-driven pad and `randomnotes` bells. The effect routing
    follows the notes that came with the original patches.
  - **`goodenizer-demo`** — a guided tour of the five dynamics/tone
    processors: parallel compression on a bus, saturation and a tilt EQ on a
    track, a `goodenizer` on master, and an LFO patched into its compressor's
    threshold for a pumping mix.

  Every session runs a `goodenizer` on master named `glue` — `/glue` reports
  what it's doing and `/glue mix=0` takes it off.

  Each prints a short readme in the console when it opens, saying what it is
  and which commands are worth trying. Any other `.json` you put in
  `static/sessions/` gets its own URL the same way, and is listed in the
  homepage's session dropdown (with a one-line summary of what's in it). If the
  file is missing or unparseable the page still opens, as an empty session,
  with a banner saying why.

A session page has two panes with a collapse arrow and a drag-to-resize handle
between them.

## The console (left pane)

- The input is **focused as soon as the page loads** — just start typing.
- Type a command and press **Enter**; the result is logged to the scrollback.
- Lines marked with a leading **`·`** arrived on their own, with no command
  directly above them. That's how deferred work reports back: `/hats stop
  at=cycle` answers "hats will stop (next cycle)" immediately, then `·  hats
  stopped` a bar later when it actually happens. Failures come back the same
  way, so a scheduled change can't fail silently.
- A session's **readme** (if it has one) is printed on open, set off with an
  accent rule.
- **↑ / ↓** browse command history (when the input is empty or already
  mid-browse).
- **Ghost-text completion**: as you type, a suggested completion is shown inline;
  accept it to fill it in. Completions come from the engine's `suggest` function.
- Clicking a name or parameter label in the mixer **pastes it into the console**
  at the cursor, so you don't have to retype object names.

## The mixer (right pane)

A live read/write view of the graph — channel strips for each track/bus and the
master, modulator strips, and a patch list. It reflects whatever the console (or
a loaded session) creates, and its own controls write straight back to the
engine. Collapse it to a thin rail to give the console more room.

Each channel strip has a fader with a level meter, a pan dial, **M** and **S**
buttons (mute and solo — the same thing `/kick mute` and `/lead solo` do, and
they update from either side; master has no S, since soloing it would mean
nothing), its insert chain, and its sends. A strip that's quiet because
*another* channel is soloed shows S as an outline rather than a fill.

Groups have no strip — they're a console-only way to address several objects at
once (`/add_group name=kit members=kick,snare,hats`, then `/kit mute`).

## Transport

The transport bar shows/controls the clock and has **Save** / **Load** buttons.
Save/Load run the same `/save_json` / `/load_json` commands the console would, so
their results appear in the scrollback like any typed command. A saved session is
a `.json` file (see [sessions](../../../ribbit/docs/user/commands.md)); loading one
rebuilds the whole graph.

## Recording

Between the clock and the Save/Load buttons sit the recorder controls:

- **REC** — start/stop. The dot blinks while recording, and the readout beside
  it shows the running length and channel count; once stopped, it shows the
  take's length.
- **ST / MT** — stereo or multitrack. Stereo records master alone as one
  `.wav`; multitrack records every track, every bus, and master as its own
  file, downloaded together as a `.zip`. Locked while recording, since the
  mode decides how many files a take has.
- **Save** — encode and download the take. **×** — throw it away.

These run `/record`, `/stop_record`, `/recording mode=…`, `/save_record` and
`/clear_record`, so their results appear in the scrollback — which matters
here, because "saved ribbit-….zip — 4 files, 24.0s" is your only confirmation
that a download had something in it. Typing the commands gets you `at=beat` /
`at=cycle`, which the buttons can't offer: `/record at=cycle` … `/stop_record
at=cycle` gives a take that is a whole number of loops long. Full reference in
[Recording](../../../ribbit/docs/user/commands.md#recording).

## Audio options

The homepage has an **audio options** panel:

- **Output device** — pick which audio output to play through (where the browser
  supports `setSinkId`).
- **Latency** — `interactive` (lowest latency), `balanced`, or `playback` (fewest
  glitches).

These are saved to `localStorage` (`nllc:audioLatencyHint`,
`nllc:audioOutputDeviceId`) and applied when a session page next constructs its
engine. Latency only takes effect at `AudioContext` construction time, so it's
read before the engine is created; the output device can be applied any time
after.

### Samples

The engine's `sampler`, `percsampler` and `granular` synths fetch sample files
from `/samples/…`; this app serves them from `static/samples/`:

```
static/samples/
├── kicks/  snares/  hats/  percs/    the four drum categories percsampler builds a kit from
└── foley/                            field recordings — rain, rivers, birds, glass
```

Two synths pick files at random, and a browser can't list a directory over
HTTP, so the app also serves `/samples/manifest.json` describing what's there.
`percsampler` reads the four drum categories (which are fixed — its slot
layout depends on them); `granular` reads **any** folder by name, `foley` by
default. Practically: **drop a `.wav` into a folder — or make a new folder —
and it's immediately in the pool**, no config and no restart while the dev
server is running. Loose files at the top level of `static/samples/` aren't
picked up by the manifest, but are still loadable by name (that's where
`sampler`'s built-in defaults live).

A note on `foley/`: these are unedited field recordings, so they're long (up
to four minutes) and quiet (one peaks 30dB below another). `granular`
gain-matches each one on load, and reports the match in the track summary.

### Patterns

The engine's `patternvariator` modulator plays **hand-written** musical
material — drum rhythms, chord progressions, melodies — from JSON files this
app serves out of `static/patterns/`. Each subfolder is a **pack**:

```
static/patterns/
├── hiphopdrums/    boom-bap, dusty, halftime, laid-back, polymeter, broken
├── darkchords/     minor-drift, seventh-fall, pedal-shift, nocturne, ...
├── ambientchords/  drone-fifths, slow-bloom, suspended, open-ninths, tidal, halo
└── melodies/       pentatonic-cell, descending, arp-cell, call-response
```

`ambientchords` is written for pads rather than keyboards: sparse, wide
voicings whose `duration` is longer than their `step_beats`, so chords overlap
and bleed into one another. It's what `granular-pad` runs on.

Same arrangement as samples, and for the same reason: a browser can't list a
directory, so the app serves `/patterns/manifest.json` describing what's there.
Practically, **drop a `.json` into a folder (or make a new folder) and refresh**
— no config, no code change, no restart while the dev server is running.

These files are meant to be edited. A drum pattern is a character grid:

```json
{ "kind": "drums", "step_beats": 0.25,
  "lanes": { "kicks":  "x... ..x. ..x. ....",
             "snares": ".... x... .... x...",
             "hats":   "x.x." } }
```

Full format reference, including chords and melodies:
[ribbit/docs/user/patterns.md](../../../ribbit/docs/user/patterns.md).
