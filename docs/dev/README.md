# NLLC app architecture

NLLC is a SvelteKit app that is a thin **interface** over the
[`ribbit`](../../../ribbit/) engine. The engine owns all audio state and logic;
the app owns the console, the mixer, page routing, audio-options prefs, and the
natural-language layer. If you're changing engine behavior, you want
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
   `window.nllc = engine` and `window.nllcLlm = llm` under
   `import.meta.env.DEV` — debug handles that never ship in a build. Some
   state has no text form the console could print (a param's *modulated*
   value, a node's connections; the LLM queue's depth or its provider-side
   conversation id), and this is how a smoke test reaches it without inventing
   a console command whose only user is the test. See `.claude/skills/run`'s
   `js:` directive.
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

- `+page.svelte` — homepage: links, the language-model panel, and the
  audio-options panel. Writes prefs to `localStorage` (`nllc:audioLatencyHint`,
  `nllc:audioOutputDeviceId`, `nllc:llmModel`); it never constructs an engine
  itself, just remembers prefs for the session pages. The model dropdown is
  filled from `api/llm/models` and auto-picks the first available model only
  when nothing is chosen yet — a *saved* choice that has gone missing is warned
  about rather than silently replaced, since the usual cause is a daemon that's
  temporarily down.
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
- `api/llm/{models,context,chat}/+server.js` — the natural-language layer's
  server side. `models` and `context` are plain `GET`s; `chat` is a streaming
  `POST`. Unlike the two manifest routes above, these serve *this app*, not a
  contract the engine defines — the engine knows nothing about them. See the
  natural-language layer section below.

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
- `llm.js` — `LlmSession` (conversation state, queue, the `/llm` grammar) plus
  `parseLlmCommand`, `describeContext` and `formatMeta`. See the
  natural-language layer below. Replaced the old `ollama.js` stub, and is named
  for what it now is: a model is `"<provider>:<model>"`, and Ollama is only the
  local one.
- `llm-context.js` — `describeSession(engine)` and `buildUserTurn`, the
  volatile half of the prompt. The static half lives in `static/context/`.

## Natural-language layer

NLLC's reason for being, and the one part that stays in the app rather than the
engine. Today it answers questions (`/llm <question>`); the eventual job is
translating free text into the slash-commands `createCommandRouter` exposes.

### Why any of it is server-side

`src/lib/server/llm/` and `src/routes/api/llm/` exist for one hard reason: the
`claude` provider spawns a process, which a browser cannot do. Ollama alone
*could* be called straight from the page, but then the client would branch on
provider, and browser→Ollama depends on that machine's `OLLAMA_ORIGINS` rather
than on anything this app controls. One server shape for both avoids both.

### Providers

A provider is a module in `src/lib/server/llm/` exporting `id`, `label`,
`listModels()` and `chat(request)` — an async generator of
`{type: "delta" | "reasoning" | "done"}`. `index.js` is the registry; a model is
addressed as a qualified id, `"<provider>:<model>"`, split on the **first**
colon because Ollama's own names contain one (`qwen3.6:27b`).

| | `ollama.js` | `claude.js` |
|---|---|---|
| transport | HTTP to `OLLAMA_HOST` | spawns `claude -p` |
| memory | resends a `history` array | `--session-id` / `--resume`; the CLI owns the transcript |
| structured output | `format` (JSON schema) | `--json-schema` |
| auth | none | the CLI's own — with no `ANTHROPIC_API_KEY` set it uses the logged-in subscription (`apiKeySource: "none"`) |

Each provider honours what it can of the request and ignores the rest, which is
why `conversationId` and `history` coexist. `claude.js` runs with `--tools ""`
and a scratch cwd: a music-console assistant has no business reading the
filesystem or discovering this repo's `CLAUDE.md`.

`listAllModels()` returns one group per provider, **each carrying its own
error** — Ollama being stopped must not empty the dropdown of Claude models.

### Routes and the wire format

- `api/llm/models` — the homepage dropdown.
- `api/llm/context` — what `/llm --context` reports.
- `api/llm/chat` — one turn, streamed as **NDJSON** (`start`, `reasoning`,
  `delta`, `done`, `error`, one JSON object per line). NDJSON rather than SSE
  because the client is a `fetch` reader — `EventSource` can't POST a body.
  Errors after the first byte arrive as an `error` *line*, since the response is
  already committed; only request validation gets a real 4xx.

### The prompt has two halves

The split is by how often each changes, which decides where each lives:

| | Built by | Changes | Sent as |
|---|---|---|---|
| static | `server/llm/context.js`, from `static/context/*.md` | when you edit a file | system prompt |
| volatile | `scripts/llm-context.js`, from the live engine | every question | `<session-state>` block on the user turn |

Keeping live state **out** of the system prompt is load-bearing twice over: it
leaves the static prefix byte-identical so a provider can cache it, and Claude's
CLI fixes a session's system prompt at creation time while `--resume` carries
the conversation past it.

`describeSession()` renders the graph as compact text rather than the raw
session JSON — same information at roughly 40% of the tokens, built from
`snapshotSession()` so it can't drift from what `/save_session` writes.

Context files are re-read **per request**, not cached. They're a few kB in front
of a call that takes seconds, and the payoff is that editing a rule and re-asking
picks it up with no restart.

### Client (`scripts/llm.js`)

`LlmSession` owns conversation state and a **queue**. Requests queue rather than
being rejected (a queued question is still one you meant to ask), capped at four.
Engine commands never queue — `SessionPage.dispatch` sends `/llm` here and
everything else straight to the engine router, so `/kick stop` never waits behind
a question.

Switching model mid-conversation **clears the transcript**: a provider-side
conversation id belongs to the provider that issued it, and half-carrying history
across a switch produces a model confidently answering about a conversation it
never had.

### Why `/llm` isn't an engine command

`createCommandRouter` splits a submitted line at every `/` and parses the rest as
`key=value` pairs — correct for commands, fatal for prose. `/llm how do I
sidechain the pad?` would be shredded before any handler saw it. So
`parseLlmCommand` intercepts in `SessionPage` first. Two consequences handled
there: `RESERVED_NAMES.add("llm")` keeps an object from being named `llm` and
shadowed, and `dispatchSuggest` disables ghost-text completion once a line starts
`/llm ` (the console accepts *and submits* ghost text on Enter, so completing
`/rev` inside a question would submit something else). The engine still gets
first refusal on every other completion, so `/l` remains `/load_session`.

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

`static/context/` holds the in-app assistant's system prompt as markdown —
every `.md` in it is concatenated (filename order) into the prompt on every
`/llm` question. Like patterns, it's *content the user is expected to edit*;
unlike patterns, it's read **server-side** (`src/lib/server/llm/context.js`)
rather than fetched over HTTP, so being under `static/` buys editability and the
ability to read the model's own context at `/context/<file>.md`, not the
serving. `README.md`, `_`-prefixed and dotfiles are skipped; five files ship
(`00-role`, `10-ribbit`, `20-types`, `30-examples`, `40-house-rules`), about
3.4k tokens all told. Two properties the other static folders don't have: every
byte is a **fixed cost on every question** (`/llm --context` prints the budget),
and `20-types.md` **restates the engine's type registry**, so it goes silently
stale when a type is added or removed — see that folder's own `README.md`, and
the step in `.claude/tasks/*_creation.md`.

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
