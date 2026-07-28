# NLLC app architecture

NLLC is a SvelteKit app that is a thin **interface** over the
[`ribbit`](../../../ribbit/) engine. The engine owns all audio state and logic;
the app owns the console, the mixer, page routing, audio-options prefs, and (in
future) the natural-language layer. If you're changing engine behavior, you want
the [ribbit dev docs](../../../ribbit/docs/dev/), not this file.

## Dependency wiring

`ribbit` is consumed as an npm package. In this workspace it's an npm
**workspace** (see the root `package.json`), so `nllc/node_modules/ribbit` is a
symlink to `../ribbit` and edits to the engine are live in the dev server with no
reinstall. `nllc/package.json` just declares `"ribbit": "*"`.

```js
import { Ribbit, createCommandRouter, loadSession } from "ribbit";
```

## The single integration point

Everything that touches the engine lives in **one** file:
`src/lib/components/code-editor/SessionPage.svelte`. It:

1. Constructs one `Ribbit` instance **client-side only** (inside `onMount` —
   `AudioContext` doesn't exist during SSR), passing the saved `latencyHint` and
   applying the saved output device.
2. Builds the command router: `const { executeCommand, suggest } =
   createCommandRouter(engine)`, and hands those to the console.
3. When given a `sessionUrl`, `fetch`es that JSON and calls
   `loadSession(engine, json)` — reporting a failed fetch/parse in a banner
   rather than silently leaving an empty session.
4. Tears the engine down in its `onMount` cleanup (`engine.dispose()`) — the
   `AudioContext` and the clock's timer loop outlive the component otherwise,
   so navigating back to the homepage would leave the session playing.
5. **Polls** `engine.tracks/buses/modulators/patches` on each animation frame and
   diffs them by element identity, copying into `$state` arrays so the mixer
   re-renders when the console (or a load) mutates the graph. The engine's arrays
   are plain and non-reactive by design — this poll-and-diff is the bridge.

No other component imports the engine; they all receive the `engine` instance (or
derived data) as props and call its methods.

## Routes (`src/routes/`)

- `+page.svelte` — homepage: links + the audio-options panel. Writes prefs to
  `localStorage` (`nllc:audioLatencyHint`, `nllc:audioOutputDeviceId`); it never
  constructs an engine itself, just remembers prefs for the session pages.
- `code-editor/+page.svelte` — `<SessionPage />`, a blank session.
- `code-editor/[session]/+page.svelte` — `<SessionPage
  sessionUrl="/sessions/{slug}.json" />`, the slug coming straight from the URL
  segment via its `+page.js`. Deliberately not validated against the real file
  list: an unknown slug still renders the page and reports the 404 in
  `SessionPage`'s banner, which keeps this route from needing its own server
  load, and means a session file added while the app is running works
  immediately.
- `+page.server.js` — lists `static/sessions/*.json` for the homepage dropdown.
  `static/` isn't in the module graph and a browser can't list a directory over
  HTTP, so this has to be a *server* load; it also parses each file to build the
  one-line summary shown under the dropdown.

## Components

**code-editor/**
- `SessionPage.svelte` — the page shell + the integration point (above).
- `CodeEditor.svelte` — the console: a text input plus scrollback. It's
  engine-agnostic — it just calls `onCommand(text)` and logs the returned string,
  and calls `onSuggest(text, cursorPos)` for ghost-text completion. Owns command
  history (↑/↓) and the ghost overlay; exposes `insertAtCursor` / `runCommand` so
  the mixer can paste names and the transport can run save/load.

**mixer/**
- `Mixer.svelte` — a read/write view of the live graph; lays out channel strips,
  modulator strips, and the patch list.
- `MixerChannel.svelte` — one track/bus/master strip (fader, pan, inserts, sends).
  Also polls its processor list, mirroring SessionPage's poll pattern.
- `MixerSection.svelte`, `ModulatorStrip.svelte`, `PatchList.svelte`,
  `CollapsedRail.svelte`, `Transport.svelte` — sections, modulator controls, the
  patch list, the collapsed rail, and the transport/save-load bar.

## Shared scripts (`src/lib/scripts/`)

- `drag.js` — `beginDrag(event)`, used by all three pointer-drag sites (the
  pane divider in `SessionPage`, `MixerSection`'s resize handles, and
  `MixerChannel`'s pan dial). It exists because suppressing drag-selection
  takes two separate things, and getting only one of them is the common bug:
  `preventDefault()` on the pointerdown stops a *new* selection starting from
  the handle, while a `body.dragging` class (styled in `theme.css`) suppresses
  `user-select` document-wide so a selection made *earlier* somewhere else
  can't be extended by the drag either. Returns the cleanup to call on
  pointerup. Note it also suppresses the click's default focus, so a drag
  target that should stay focusable refocuses itself (see the pan dial).

## Natural-language layer (future)

`src/lib/scripts/ollama.js` is a stub (`Ollama`) — NLLC's reason for being. The
intended integration point for translating free text into ribbit slash-commands
(the vocabulary `createCommandRouter` exposes) via a local Ollama model. Not yet
wired to anything.

## Static assets

`static/samples/` holds the drum samples the engine's `sampler` fetches from
`/samples/…`. `static/sessions/` holds session JSON files: each one is both a
`/code-editor/<name>` route and an entry in the homepage dropdown, purely by
being in that folder.

## Styling

`src/routes/theme.css` / `reset.css` define the app theme (CSS custom properties
prefixed `--nllc-*`). Components are scoped Svelte styles.
