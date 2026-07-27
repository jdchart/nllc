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

- **`/`** — homepage: links to the sessions below, plus the **audio options**
  panel (see below).
- **`/code-editor`** — a **blank session**: nothing but the master channel.
- **`/code-editor/demo`** — the same page, auto-loading `static/sessions/demo.json`
  on open (a couple of tracks, a reverb bus, an LFO patch, a couple of saved
  states). Good for hearing something immediately or reading as a worked example.

A session page has two panes with a collapse arrow and a drag-to-resize handle
between them.

## The console (left pane)

- Type a command and press **Enter**; the result is logged to the scrollback.
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

## Transport

The transport bar shows/controls the clock and has **Save** / **Load** buttons.
Save/Load run the same `/save_json` / `/load_json` commands the console would, so
their results appear in the scrollback like any typed command. A saved session is
a `.json` file (see [sessions](../../../ribbit/docs/user/commands.md)); loading one
rebuilds the whole graph.

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

The engine's `sampler` synth fetches sample files from `/samples/…`; this app
serves them from `static/samples/`.
