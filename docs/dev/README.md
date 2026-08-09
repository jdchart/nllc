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
   createCommandRouter(engine)`, and hands those to the console. Also assigns
   `window.nllc = engine` under `import.meta.env.DEV` — a debug handle that
   never ships in a build. Some engine state has no text form the console
   could print (a param's *modulated* value, a node's connections), and this
   is how a smoke test reaches it without inventing a console command whose
   only user is the test. See `.claude/skills/run`'s `js:` directive.
3. When given a `sessionUrl`, `fetch`es that JSON and calls
   `loadSession(engine, json)` — reporting a failed fetch/parse in a banner
   rather than silently leaving an empty session.
4. Tears the engine down in its `onMount` cleanup (`engine.dispose()`) — the
   `AudioContext` and the clock's timer loop outlive the component otherwise,
   so navigating back to the homepage would leave the session playing.
5. Wires `engine.onMessage` to `CodeEditor.appendOutput`, the channel for
   output that arrives with no command waiting on it — deferred `at=beat`/
   `at=cycle` work reporting back (`kind: "deferred"`, rendered with a leading
   `·`) and a loaded session's readme (`kind: "readme"`, rendered as an
   accent-ruled block). Unset, the engine falls back to `console.log`, so this
   is the difference between a deferred failure being visible in the app and
   only in devtools.
6. **Polls** `engine.tracks/buses/modulators/patches` on each animation frame and
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
- `samples/manifest.json/+server.js` — a `GET` endpoint returning what's in
  `static/samples/`, one key per folder, each entry a path relative to
  `/samples/`. Same directory-listing constraint as the session dropdown above,
  and the app's side of a contract the engine defines: `percsampler` fills its
  kit at random and `granular` picks one source recording at random, so both
  have to be told what the candidates are. Serving audio files under
  `/samples/` was already the host's job; this is the same job extended.

  The four drum categories (`kicks`, `snares`, `hats`, `percs`) are listed
  first and **always present, empty if missing** — `percsampler`'s slot
  arithmetic depends on them existing. Every *other* directory is published
  too, as an ordinary folder nothing special is promised about, and omitted if
  it holds no audio: that's what makes `static/samples/foley/` visible to
  `granular`, and adding a folder the whole workflow for a new source library.
  A missing or unreadable folder is reported as empty rather than failing the
  request, since the engine copes with an empty folder but not with a broken
  response. Note the route deliberately sits *under* `/samples/` alongside the
  files it describes, which only resolves as long as no literal
  `static/samples/manifest.json` exists to shadow it — static files win over
  routes.
- `patterns/manifest.json/+server.js` — the same endpoint shape for
  `static/patterns/`, serving the engine's `patternvariator`: `{ <pack>:
  ["<pack>/<name>.json", ...] }`, each entry relative to `/patterns/`. Kept
  deliberately identical in shape to the samples route so a host author learns
  one rule, not two. The remaining difference is only that *nothing* is fixed
  here — every subdirectory is a pack, whereas the samples route guarantees
  the four drum categories. A pack containing no `.json` is omitted entirely
  rather than offered as an empty choice, so `pack=random` can never land
  somewhere with nothing to play. Same shadowing caveat as above.

## Components

**code-editor/**
- `SessionPage.svelte` — the page shell + the integration point (above).
- `CodeEditor.svelte` — the console: a text input plus scrollback. It's
  engine-agnostic — it just calls `onCommand(text)` and logs the returned string,
  and calls `onSuggest(text, cursorPos)` for ghost-text completion. Owns command
  history (↑/↓) and the ghost overlay; exposes `insertAtCursor` / `runCommand` /
  `appendOutput` so the mixer can paste names, the transport can run save/load,
  and the engine can push output no command is waiting on (below). Focuses its
  input in `onMount` — the console is what the page is for, so it takes the
  caret immediately. (`onMount` rather than the `autofocus` attribute, which
  needs an a11y suppression, or an `$effect`, which wouldn't reliably track
  `inputEl` — a plain `bind:this` target, not `$state`.)

**mixer/**
- `Mixer.svelte` — a read/write view of the live graph; lays out channel strips,
  modulator strips, and the patch list.
- `MixerChannel.svelte` — one track/bus/master strip (fader, pan, mute/solo,
  inserts, sends). Also polls its processor list, its sends, and the channel's
  `muted`/`soloed`/`_soloSilenced` flags, mirroring SessionPage's poll pattern —
  all of those can change from the console or a `/recall`, not just from a
  click. The M/S buttons call `channel.setMuted`/`setSoloed` directly rather
  than running a console command, since they're hit mid-phrase and shouldn't
  land a scrollback line behind the click. `soloable={false}` for master.
- `ModulatorStrip.svelte` — meters a modulator's continuous output, or flashes
  per firing for one that has none. A modulator counts as "flashing" if it
  implements `generateEvents` (a note generator) *or* `onSchedule`
  (`randomgestures`, which sets `lastEventTime` itself); the label reads
  "notes" or "gestures" accordingly.
- `MixerSection.svelte`, `PatchList.svelte`,
  `CollapsedRail.svelte`, `Transport.svelte` — sections, modulator controls, the
  patch list, the collapsed rail, and the transport/save-load bar.
- `Recorder.svelte` — the recorder controls inside `Transport.svelte`: REC, a
  duration/channel readout, an ST/MT mode toggle, and Save/discard. Like
  Transport's own Save/Load buttons, every control runs the real console
  command through `onRunCommand` rather than touching `nllc.recorder`
  directly — `/record` is the one command that can take a moment (it compiles
  an AudioWorklet on first use) and whose result the user actually needs to
  read. State is polled in its own `requestAnimationFrame` loop, since the
  recorder is a plain object mutated by engine code.

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

`static/samples/` holds the audio the engine's `sampler`, `percsampler` and
`granular` fetch from `/samples/…`, enumerated by the manifest route above.
Four subfolders — `kicks/`, `snares/`, `hats/`, `percs/` — are the categories
`percsampler` builds a kit from; `foley/` holds unedited field recordings for
`granular`, and any further folder added would work the same way. Loose files
at the top level are ignored by the manifest but still fetchable by name
(that's where `sampler`'s defaults live). Adding or removing a `.wav` needs no
code change and no rebuild under `vite dev`.

Two properties of `foley/` that drum samples don't have, and that the engine
handles rather than the app: the files are **long** (up to four minutes, held
whole in memory once decoded, doubled if `granular` plays them in reverse) and
**unnormalized** (spanning ~30dB, so `granular` peak-matches each on load).

`static/patterns/` holds hand-written pattern files, enumerated by the patterns
manifest route above. Each subfolder is a pack; four ship — `hiphopdrums/`
(drum lanes), `darkchords/`, `ambientchords/` and `melodies/` (scale degrees). Unlike samples,
these are *content the user is expected to edit*: the format is designed for
hand-editing (see
[ribbit/docs/user/patterns.md](../../../ribbit/docs/user/patterns.md)), and
adding a folder or a file needs no code change and no rebuild under `vite dev`.
Note a pack outlives any particular modulator — removing `patternvariator`
wouldn't make the packs meaningless, which is why they're content rather than
type-owned assets.

`static/sessions/` holds session JSON files: each one is both a
`/code-editor/<name>` route and an entry in the homepage dropdown, purely by
being in that folder. Twelve ship: `demo.json` (the starter session: a euclidean
grid plus Markov ghosts under two `tapepad` layers and one authored track — a
combination of `euclid-ghosts` and `ambient-tape`), `percs-demo.json` (four
category-restricted `percsampler` tracks fed by one `markovpercs`, through
reverb and delay buses), `euclid-demo.json` (the euclidean grid generator),
`euclid-ghosts.json` (a euclidean backbone plus a Markov ghost layer on
the same tracks), `pattern-drums.json` (two `patternvariator`s reading
`hiphopdrums/` over one split kit), `pattern-chords.json` (chords and a
melody on two `karplus` tracks), `goodenizer-demo.json` (the dynamics and
tone processors: parallel compression on a bus, saturation and tilt on a
track, a `goodenizer` on master, and an LFO patched into its threshold),
`granular-pad.json` (three `granular` tracks over the `ambientchords` pack,
making chords out of `foley/` field recordings), `ambient-tape.json`
(three `tapepad` layers over the same pack, plus a `hiphopdrums` beat) and
`chorale-drift.json` (three `chorale` generators, no percussion at all, one of
them driving two tracks at once) and `chaos-states.json` (three `chaossynth`
tracks at `spread` 0.6/0.95/0 plus a euclidean kit — the worked example of a
MIDI note selecting a state rather than a pitch) and `cz-tapes.json` (five
`czsynth` tracks over a euclidean kit — the worked example of a preset-backed
synth, and of the CZ's DCW behaving like a filter that isn't one).

All twelve carry a `goodenizer` insert named `glue` on master, tuned per
session in the file's `master.processors`.

The files are stored **width-budget compacted** — short objects and arrays
inlined, `readme` one line per element. Nothing reads the formatting, but they
are legible enough to hand-edit, which one value per line was not.

Each carries a top-level **`readme`** — an array of lines the engine prints to
the console on load (see `ribbit`'s `session.js`). It's the right place for
what the session is and which commands to try; `/save_json` round-trips it. A
new session file should have one.

## Styling

`src/routes/theme.css` / `reset.css` define the app theme (CSS custom properties
prefixed `--nllc-*`). Components are scoped Svelte styles.
