# NLLC — LLM context overview

NLLC is a browser-based live-coding music environment (SvelteKit + Web Audio API).
A user types slash-commands into a console; commands create/control **tracks**
(each wrapping a **synth**), **buses** (plain channels with no synth, used as
shared send destinations — a sub-mix or a shared effect), **processors** (effects,
inserted into a track's/bus's/master's chain), **modulators** (continuous control
sources, e.g. an LFO, patched into any parameter), and **patches** (the connections
between a modulator/other source and a destination parameter), plus the
**master** bus, all playing on a shared, looping, lookahead-scheduled **clock**.
Conceptually closest to a tiny text-driven Max/MSP or SuperCollider. Eventual
goal (not yet built): the user types natural language instead of commands, and
an LLM (via `Ollama()`, currently an empty stub) translates it into this same
command vocabulary or direct graph mutations.

## Object model

```
NLLC                         top-level owner, one per page
├── audioContext             Web Audio AudioContext (suspended until /start)
├── clock: NLLCClock         lookahead scheduler; holds all "units"
├── master: NLLCChannel      final bus → audioContext.destination
├── tracks: NLLCTrack[]      extends NLLCChannel; each has .source = a synth
├── buses: NLLCChannel[]     plain channels (no synth), addressable send destinations
├── processors: NLLCProcessor[]   flat registry of every processor anywhere
├── modulators: NLLCModulator[]   flat registry of every modulator (e.g. an lfo)
└── patches: NLLCPatch[]     every active "patch cable" (source.output → depth → destParam)
```

- **`NLLCChannel`** (base of `master`, every `NLLCTrack`, and every bus): fader
  (`params.gain`, 0–1 position tapered onto the actual gain), pan (`params.pan`,
  -1..1), an ordered insert chain of processors, and a `sends` array — every
  place this channel's post-fader signal currently feeds. `_rewireChain()`
  connects `input → active processors in order → panner → gainNode`; from
  `gainNode`, each entry in `sends` is its own independent `{ id, destination,
  destName, params: { gain: NLLCParam } }` edge (`gainNode → sendGain →
  destination.input`), so one channel can feed several places at once at
  different levels (e.g. dry to master, a wet send to a reverb bus).
  `connect(destination, destName)` is sugar over this: it clears every existing
  send and adds a single one at gain 1 — the common case (a fresh track/bus
  feeds master alone) — while `addSend`/`removeSend` support the general
  multi-send case. A **bus** is just a plain `NLLCChannel` with no `.source`,
  created via `/add_bus`, existing purely to be a send destination other
  channels route into.
- **`NLLCSynth`** (base of `NLLCOscSynth`, `NLLCSampler`): produces sound. Has
  `events` (`NLLCEvent{beat,pitch,degree,velocity,duration}` — starts **empty**,
  populated via `add_event`), a `trigger(time, event, secondsPerBeat)` method the
  clock calls per-event, an `output` GainNode, `harmony` (the shared context, see
  below), and an `active` flag (transport pause, distinct from routing bypass).
- **`NLLCProcessor`** (base of `NLLCReverb`, `NLLCDelay`): effects, continuously
  in a channel's signal chain (no per-event trigger). Has `input`/`output`
  GainNodes, `params` (`{name: NLLCParam}`) as its console-facing control
  surface, and `active` as a *routing bypass* (handled by the owning channel).
- **`NLLCModulator`** (base of `NLLCLFO`): a continuous control source,
  structurally a processor's sibling (`params`, no per-event trigger) but never
  joins a channel's chain — it exists only to be patched somewhere via
  `NLLCPatch`. `output` is bipolar (`-1..1`-ish) by convention; a patch's own
  `depth` decides how hard it pushes any given destination.
- **`NLLCPatch`**: one connection — `source.output → depthGain → destParam`,
  literally a native Web Audio "connect a node into an AudioParam," which
  *adds* to whatever the destination's own value/ramp already is rather than
  overriding it. `depth` lives on the patch (an `NLLCParam`), not either
  endpoint, so one modulator can drive several destinations at different
  amounts. Source can be a modulator, or any object with an `.output`
  (a track/master's post-fader signal, a processor's post-effect signal).
  Destination is `"name.param"` (e.g. `"reverb.wet"`, `"track_1.gain"`,
  `"lfo1.freq"`), resolved against whatever object exposes that key in its
  own `params`.
- **`NLLCParam`** (`param.js`): the one class every rampable/patchable param
  (channel gain/pan, any processor param, any modulator param, patch depth)
  is built from — wraps one raw `AudioParam`, optional `decode`/`encode`
  (channel gain's exponential taper), `min`/`max` clamp, optional `onSet` for
  a param that fans out across more than one node (`NLLCDelay.time`). One
  shared `commands.js` function (`applyParams`) does get/set/ramp/defer for
  any of them — there is no per-object-kind duplicate of this logic.
- **`NLLCClock`**: `setTimeout`-based lookahead scheduler (25ms lookahead, 100ms
  schedule-ahead window), loops every `loopLengthBeats` (default 4) beats — both
  `bpm` and `loopLengthBeats` are runtime-mutable (`/clock bpm= num_beats=`), and
  `bpm` can also be ramped over time (`rampBpm`, via a stepped timer rather than
  native `AudioParam` automation, since bpm isn't one). Treats synths, channels,
  processors, and modulators uniformly as "units" — anything with
  `events`/`automation`/`trigger()`/`active`. Its own `_tick()` is wrapped in a
  try/catch so one bad event/param can only drop a single scheduling pass, never
  permanently kill the engine. Also exposes `nextBeatTime()`/`nextCycleTime()`,
  the anchors for deferred console ramps/instant sets (see below).
- **`NLLCAutomationEvent`**: a parameter ramp targeting a real `AudioParam`
  (`from → to` over `duration` beats, `curve: linear|exponential|target`, `once`
  for non-repeating ramps like a fade-in), matched against loop-relative beat
  position by the clock. Distinct from a **console ramp** (`/track_1 gain=0 3`),
  which is a one-off `scheduleRamp()` call anchored to an absolute time
  (immediate by default, or the next beat/cycle with `at=beat`/`at=cycle`) and
  never touches a unit's `.automation` array — see `automation.js`. `at=beat`/
  `at=cycle` also works on a plain (non-ramped) instant set, deferring it via
  `setValueAtTime` instead of applying it immediately.
- **Harmony context** (`nllc.harmony`, from `harmony.js`): one shared
  `{ root, scale }` object threaded into every synth. `NLLCEvent.degree` is
  resolved against it *at trigger time* (not when authored), so changing the
  context retunes already-scheduled patterns live. `scale` defaults to
  chromatic (degree ≈ semitone offset) — real scale/chord logic and a runtime
  command to change it are not built yet, only the hook.

## Type registries (extend here, nowhere else, for new types)

`src/lib/scripts/nllc-src/nllc.js`:
```js
const SYNTH_TYPES = { oscsynth: NLLCOscSynth, sampler: NLLCSampler };
const PROCESSOR_TYPES = { reverb: NLLCReverb, delay: NLLCDelay };
const MODULATOR_TYPES = { lfo: NLLCLFO };
```

Non-base implementations live one folder down from `nllc-src/`, grouped by
kind — `synths/oscsynth.js`, `synths/sampler.js`; `processors/reverb.js`,
`processors/delay.js`; `modulators/lfo.js` — while the base classes
(`synth.js`, `processor.js`, `modulator.js`, `channel.js`, etc.) stay directly
in `nllc-src/`. A new synth/processor/modulator file goes in the matching
subfolder (imports the base class as `../synth`/`../processor`/`../modulator`)
and is registered in `nllc.js` exactly as above — nothing else needs to change.
There is no folder for buses; a bus is just a plain `NLLCChannel`, not a new
class.

## Command surface (full detail: `docs/user/commands.md`)

`/name key=val ...` where `name` is a top-level command (`start`, `stop`,
`add_track`, `tracks`, `add_bus`, `buses`, `clock`, `add_modulator`,
`modulators`, `patch`, `unpatch`, `patches`), `master`, a track's name, a
bus's name, a processor's name, or a modulator's name. Channels (tracks,
buses, master) support `gain=`, `pan=`, `add_event`, `clear_events`, `start`,
`stop`, `synth=`, `add_processor=`, `remove_processor=`, `remove_self`, plus
routing: `out=<name>` (replace every current send with a single one to
`<name>`), `add_send=<name>` (optionally `send_gain=<0-1>`, default 1 — add
one more send without disturbing existing ones), `remove_send=<id>`, and
`send=<id>` (optionally `send_gain=<value>`, rampable/`at=` deferrable like
any param — report or adjust one existing send's own gain). A track's/bus's
own default send (created at creation time, or via `out=` with no
destination given) targets `master`. `add_event`/`clear_events`/`start`/
`stop`/`synth=` are no-ops (reported as "\<name\> has no synth") on master and
on any bus, since neither has a `.source`. Processors and modulators support
their own `params` keys plus `remove_self`, and `help`/no-args to introspect.
Every addressable object (channel, processor, modulator) answers no-args with
a condensed one-line summary and `help` with the full reference — every
param's value/range plus every command it accepts, each with a usage note
(`channelHelp`/`paramObjectHelp` in `commands.js`; a param's range is omitted
when it was never given `min`/`max` bounds, e.g. `NLLCReverb.wet`).
`/clock` supports `bpm=` (rampable) and `num_beats=` (deliberately not
rampable — rejected with a message if given a ramp spec).

`/add_modulator type=lfo freq=2 name=lfo1` creates a modulator; `/patch
source=lfo1 dest=reverb.wet depth=0.2` patches it into a param (creates and
returns an id like `x1`); `/patch id=x1 depth=0.5` adjusts an existing
patch's depth afterward; `/unpatch id=x1` removes it. Removing a modulator,
track, or processor automatically cascade-removes any patch touching it as
either endpoint.

`gain=`/`pan=`/any processor or modulator param accept a trailing duration to
ramp instead of setting instantly: `gain=0 3` (3 seconds) or `gain=0 4b` (4
beats). Add `at=beat`/`at=cycle` to defer the start to the next beat/loop
boundary instead of firing immediately (default) — this works for a plain
instant set too, not just a ramp (`gain=0 at=beat` jumps to 0 exactly on the
next beat rather than right now). Several `/name ...` commands can be typed
on one submitted line and they all dispatch together, e.g.
`/track_1 gain=0 8 /reverb wet=0.9 6b`. A bad numeric value (e.g.
`bpm=notanumber`) is rejected with a clean error rather than silently
becoming `NaN` and corrupting persistent state.

## Interface

`src/routes/code-editor/+page.svelte` owns the single `NLLC` instance (created
client-side only, in `onMount`, since `AudioContext` needs a browser) and the
`{ executeCommand, suggest }` pair from `createCommandRouter(nllc)`.
`CodeEditor.svelte` is
the text console; `Mixer.svelte` (with titled "Tracks"/"Buses"/"Master"/
"Modulators" sections, each showing "none" when empty except Master) composes
`MixerChannel.svelte` (one per track, one per bus, plus master — a bus needs
no changes to this component since it only ever touches `gainNode`/`pan`/
`processors`, all present on any `NLLCChannel`), `ModulatorStrip.svelte` (one
per modulator, with a live bipolar meter), and `PatchList.svelte` (every
active patch, with its live depth and a remove control) — all polled,
read/write views onto the same live audio-graph objects (fader ↔
`channel.params.gain`, pan dial ↔ `channel.params.pan`, etc.). A track/bus
strip (not master) also has its own remove (×) button, mirroring
`ModulatorStrip`'s, wired to `nllc.removeTrack`/`removeBus` — the mixer's one
other removal affordance beyond `remove_self` on the console.
Console and mixer are two UIs on one shared state, not separate stores. Sends
are console-only for now — no mixer UI for `add_send=`/`out=` yet, same
scope choice already made for modulators/patches. `CodeEditor.svelte` also
owns command history (↑/↓ recall, shell-style) and exposes an
`insertAtCursor(text)` component export (reached via `bind:this` from
`+page.svelte`, threaded down through `Mixer`/`MixerChannel`/`ModulatorStrip`
as an `onInsert` prop) — clicking a name or param label anywhere in the mixer
pastes it into the console at the current cursor. A processor's insert badge
keeps plain-click as its existing bypass toggle and layers shift+click on top
for "paste this id" instead of replacing it.

`CodeEditor.svelte` also renders contextual ghost-text completion, driven by
`suggest(input, cursorPos)` (`commands.js`'s `suggestCompletion` — completes
only at the very end of the input: the `/name` token itself, i.e. any
addressable object or top-level command, or, once past the name, a bare
param key for whatever channel/processor/modulator it resolves to; a token
already containing `=` is mid-value and isn't completed, and there's no
ranking/cycling among several matches yet, just the first one that extends
what's typed). Right arrow accepts a shown suggestion into the input; Enter
accepts *and* submits in one step. `↑`/`↓` normally recall command history,
but only when the input is empty (or mid-recall already) — otherwise they're
reserved for a not-yet-built suggestion-cycling feature and do nothing.

## Known current limitations (don't assume otherwise)

- `Ollama()` (`ollama.js`) is an empty stub — no NL-to-command wiring exists yet.
- Event authoring is manual only (`add_event`/`clear_events`, one event per
  command) — no algorithmic/pattern-generator commands (euclidean rhythms,
  step-string parsers, etc.), and no modulator/patch can generate discrete
  events (only a continuous control signal) — that would need some kind of
  "event input" concept on `NLLCSynth` that doesn't exist yet. No
  per-cycle/every-N-cycle regeneration hook exists yet either, though the
  clock's uniform "unit" contract would be the natural place to add one (an
  optional `onCycle(cycleIndex)` called at loop boundaries) if/when that's built.
- The harmony context (`nllc.harmony`) is a passthrough hook, not a real
  scale/chord system — `scale` defaults to chromatic, and there's no
  `/harmony` command yet to change `root`/`scale` at runtime.
- Synth-level runtime params (e.g. `NLLCOscSynth.waveform`) are not exposed
  through `channelCommand` the way processor/modulator params are — only
  settable via `/add_track synth=... waveform=...` at creation time.
- `NLLCSampler` sample loading is unawaited fire-and-forget; a trigger before load
  completes silently no-ops.
- `splitCommands` (multi-command-per-line) assumes no param value contains a
  literal `/`; none currently do, but a value that did would be mis-split.
- Ramping/deferred `at=` scheduling on a multi-node param (`NLLCDelay`'s
  `time`/`feedback`) only animates the "primary" node directly — the other
  node (e.g. delay's R side) only gets updated correctly by a plain, immediate
  (non-ramped, non-deferred) instant set. Pre-existing limitation, unchanged
  by the `NLLCParam` consolidation.
- Send routing (`out=`/`add_send=`) only guards against a channel sending
  directly to itself (`addSend` throws) — a longer cycle (e.g. `bus1` sends to
  `bus2`, which sends back to `bus1`) isn't detected. Native Web Audio permits
  cycles only when a `DelayNode` sits somewhere in the loop; a pure-gain cycle
  is undefined/implementation-behavior rather than a clean error. Not
  currently validated.
- Everything is stereo (`NLLCChannel`'s pan uses a `StereoPannerNode`, which is
  always 2-channel in/out). Nothing else in the signal path hardcodes a
  channel count — `GainNode`s and sends adapt to whatever arrives — so mono
  channels or L/R-targeted sends aren't architecturally blocked, just not
  built: they'd need the panner made optional/pluggable per channel, and a
  send variant that routes through a `ChannelSplitterNode`/`ChannelMergerNode`
  pair instead of straight into `destination.input`.

## Detailed docs

- `docs/user/` — tutorial, full command reference, synth/processor/modulator
  reference.
- `docs/dev/` — architecture, file-by-file source walkthrough, tutorials for
  adding a synth/processor/modulator/command.
- `docs/llm/building-synths.md`, `building-processors.md`,
  `building-modulators.md`, `adding-commands.md` — condensed, code-skeleton
  versions of the `docs/dev` tutorials for use as LLM context when the task is
  specifically "add a new X".
