import { scheduleRamp, setInstant, scheduleAt, NLLCAutomationEvent } from "./automation";
import { NLLCEvent } from "./event";

// Whole-session (de)serialization, plus the diff-and-ramp reconciler /recall
// uses. Three entry points:
//
// - snapshotSession(nllc)/sessionToJSON(nllc) — pure, JSON-serializable
//   snapshots of everything live: clock/harmony, master/buses/tracks (each
//   with their own gain/pan/inserts/sends), modulators, and patches. Every
//   rampable value goes through NLLCParam.get() (already the user-facing,
//   decoded value — see param.js), and every constructible object (synth/
//   processor/modulator) is tagged with the registry key that built it
//   (`.type`, set by NLLC.createSynth/createProcessor/createModulator) plus
//   whatever non-param constructor state it wants to round-trip
//   (`.getOptions()` — see synth.js/processor.js/modulator.js).
// - loadSession(nllc, json) — hard rebuild: tears down every track/bus/
//   modulator/patch and every processor on master, then reconstructs from
//   scratch via the same nllc.create*/addProcessor/addSend/createPatch calls
//   the console itself uses. This is the vehicle for a whole-session file
//   load — a cold-start operation, so there's no reason to make it glitch-
//   free the way /recall is.
// - applySnapshot(nllc, snapshot, { startTime, durationSeconds }) — a diff
//   against the *live* session: matching objects (by name, and for
//   processors/modulators also by type) ramp their params in place; objects
//   only in the snapshot fade in (created now, gain/depth ramped up from 0);
//   objects only live fade out (ramped to 0) and are torn down once that
//   fade completes. This is what /recall uses, via nllc.states (named
//   snapshots captured by /save — see commands.js).
//
// Reconstruction order matters in both loadSession and applySnapshot: buses
// and tracks (which can send to each other) before their own processors and
// sends are wired up, modulators after that, and patches last of all, since
// a patch resolves both endpoints by name against whatever already exists.

const SESSION_VERSION = 1;

function serializeParams(paramsMap) {
    const out = {};
    for (const [key, param] of Object.entries(paramsMap)) out[key] = param.get();
    return out;
};

// Loop-position automation, stored by param *name* with user-facing
// (decoded) from/to values — an NLLCAutomationEvent's own `target` is a raw
// AudioParam reference, which can't survive JSON. Only events carrying a
// `paramKey` (everything the console's automate= command creates — see
// commands.js) can round-trip; one built in code against a bare AudioParam
// is skipped. `_scheduled` isn't captured: a rebuilt `once` event fires once
// more after a load/recall, which is the least-surprising reading of
// "restore this state".
function serializeAutomation(object) {
    return object.automation
        .filter((event) => event.paramKey && object.params[event.paramKey])
        .map((event) => {
            const param = object.params[event.paramKey];
            return {
                param: event.paramKey,
                from: param.decode(event.from),
                to: param.decode(event.to),
                beat: event.beat,
                duration: event.duration,
                curve: event.curve,
                once: event.once,
            };
        });
};

// The inverse of serializeAutomation: re-resolves each entry's param by name
// on the (possibly freshly-constructed) object and re-encodes its values.
// An entry naming a param the object no longer has is dropped silently —
// same forgiving shape param application below already has.
function rebuildAutomation(object, list = []) {
    return list
        .map((data) => {
            const param = object.params[data.param];
            if (!param) return null;
            return new NLLCAutomationEvent({
                beat: data.beat,
                duration: data.duration,
                target: param.audioParam,
                from: param.encode(data.from),
                to: param.encode(data.to),
                curve: data.curve,
                once: data.once,
                paramKey: data.param,
            });
        })
        .filter(Boolean);
};

// Applies a saved options block ({ key: value } from getOptions()) onto a
// live object's declarative `options` map — used when /recall matches an
// object in place (a fresh construction gets the block via its constructor
// instead). Skips unknown keys and swallows a per-key set() throw, so one
// stale option can't abort the rest of a recall.
function applyOptionsSnapshot(object, optionsData = {}) {
    for (const [key, value] of Object.entries(optionsData)) {
        try {
            object.options?.[key]?.set(value);
        } catch {
            // a saved value the option no longer accepts — leave it as-is
        }
    }
};

function serializeProcessor(processor) {
    return {
        type: processor.type,
        name: processor.name,
        active: processor.active,
        options: processor.getOptions(),
        params: serializeParams(processor.params),
        automation: serializeAutomation(processor),
    };
};

function serializeModulator(modulator) {
    return {
        type: modulator.type,
        name: modulator.name,
        options: modulator.getOptions(),
        params: serializeParams(modulator.params),
        automation: serializeAutomation(modulator),
    };
};

function serializeSends(channel) {
    return channel.sends.map((send) => ({ destName: send.destName, gain: send.params.gain.get() }));
};

function serializeChannel(channel, { includeSends = true } = {}) {
    const data = {
        params: serializeParams(channel.params),
        processors: channel.processors.map(serializeProcessor),
        automation: serializeAutomation(channel),
    };
    if (includeSends) data.sends = serializeSends(channel);
    return data;
};

function serializeEvent(event) {
    return { beat: event.beat, pitch: event.pitch, degree: event.degree, velocity: event.velocity, duration: event.duration };
};

function serializeTrack(track) {
    return {
        name: track.name,
        active: track.source.active,
        ...serializeChannel(track),
        synth: {
            type: track.source.type,
            options: track.source.getOptions(),
            params: serializeParams(track.source.params),
            events: track.source.events.map(serializeEvent),
        },
    };
};

function serializeBus(bus) {
    return { name: bus.name, ...serializeChannel(bus) };
};

// An event patch (dest=<track>.notes — see NLLCEventPatch) has no `depth`,
// so this only includes it when present rather than assuming every patch is
// shaped like a regular NLLCPatch.
function serializePatch(patch) {
    const data = { sourceName: patch.sourceName, destName: patch.destName };
    if (patch.params.depth) data.depth = patch.params.depth.get();
    return data;
};

// The pure "everything live" snapshot shape shared by a whole-session save
// and one named /save state — see the module doc comment above.
export function snapshotSession(nllc) {
    return {
        clock: { bpm: nllc.clock.bpm, loopLengthBeats: nllc.clock.loopLengthBeats },
        harmony: { root: nllc.harmony.root, scale: [...nllc.harmony.scale] },
        master: serializeChannel(nllc.master, { includeSends: false }),
        buses: nllc.buses.map(serializeBus),
        tracks: nllc.tracks.map(serializeTrack),
        modulators: nllc.modulators.map(serializeModulator),
        patches: nllc.patches.map(serializePatch),
    };
};

// The full session file shape: a snapshot plus every named state /save has
// captured, so loading a session file also restores what you could /recall.
export function sessionToJSON(nllc) {
    return { version: SESSION_VERSION, ...snapshotSession(nllc), states: { ...nllc.states } };
};

function applyChannelParams(channel, data) {
    for (const [key, value] of Object.entries(data.params)) {
        channel.params[key]?.set(value);
    }
};

function loadProcessors(nllc, channel, processorsData = []) {
    for (const data of processorsData) {
        const processor = nllc.createProcessor(data.type, { name: data.name, ...data.options });
        channel.addProcessor(processor);
        processor.active = data.active;
        for (const [key, value] of Object.entries(data.params)) {
            processor.params[key]?.set(value);
        }
        processor.automation = rebuildAutomation(processor, data.automation);
    }
};

// Replaces whatever sends a freshly-created channel starts with (its default
// send to master) with the real saved list — called only once every track/
// bus this session might reference by name already exists.
function loadSends(nllc, channel, sendsData = []) {
    for (const send of [...channel.sends]) channel.removeSend(send.id);
    for (const data of sendsData) {
        const destObject = nllc._resolveObject(data.destName);
        if (destObject) channel.addSend(destObject, { destName: data.destName, gain: data.gain });
    }
};

// Tears down everything but master itself (and master's own speaker
// connection, which NLLC's constructor owns, not session data) so
// loadSession always starts from the same clean slate regardless of what
// was live beforehand.
function clearSession(nllc) {
    for (const track of [...nllc.tracks]) nllc.removeTrack(track);
    for (const bus of [...nllc.buses]) nllc.removeBus(bus);
    for (const modulator of [...nllc.modulators]) nllc.removeModulator(modulator);
    for (const processor of [...nllc.master.processors]) nllc.removeProcessor(processor);
};

// Hard-rebuilds the entire session from a JSON object shaped like
// sessionToJSON's output — see the module doc comment for why this (unlike
// applySnapshot) doesn't try to be glitch-free.
export function loadSession(nllc, json) {
    if (json.version !== SESSION_VERSION) {
        throw new Error(`unsupported session version "${json.version}" (expected ${SESSION_VERSION})`);
    }

    clearSession(nllc);

    nllc.clock.setBpm(json.clock.bpm);
    nllc.clock.setLoopLengthBeats(json.clock.loopLengthBeats);
    nllc.harmony.root = json.harmony.root;
    nllc.harmony.scale = [...json.harmony.scale];

    applyChannelParams(nllc.master, json.master);
    loadProcessors(nllc, nllc.master, json.master.processors);
    nllc.master.automation = rebuildAutomation(nllc.master, json.master.automation);

    for (const data of json.buses ?? []) {
        const bus = nllc.createBus({ name: data.name });
        applyChannelParams(bus, data);
        loadProcessors(nllc, bus, data.processors);
        bus.automation = rebuildAutomation(bus, data.automation);
    }

    for (const data of json.tracks ?? []) {
        const track = nllc.createTrack({ name: data.name, synth: data.synth.type, ...data.synth.options });
        track.source.active = data.active;
        applyChannelParams(track, data);
        loadProcessors(nllc, track, data.processors);
        track.automation = rebuildAutomation(track, data.automation);
        for (const [key, value] of Object.entries(data.synth.params)) {
            track.source.params[key]?.set(value);
        }
        track.source.events = data.synth.events.map((event) => new NLLCEvent(event));
    }

    // Sends can point at any bus/track, including ones later in these lists,
    // so they're only wired up once every possible destination exists.
    for (const data of json.buses ?? []) {
        loadSends(nllc, nllc.buses.find((b) => b.name === data.name), data.sends);
    }
    for (const data of json.tracks ?? []) {
        loadSends(nllc, nllc.tracks.find((t) => t.name === data.name), data.sends);
    }

    for (const data of json.modulators ?? []) {
        const modulator = nllc.createModulator(data.type, { name: data.name, ...data.options });
        for (const [key, value] of Object.entries(data.params)) {
            modulator.params[key]?.set(value);
        }
        modulator.automation = rebuildAutomation(modulator, data.automation);
    }

    for (const data of json.patches ?? []) {
        nllc.createPatch({ sourceName: data.sourceName, destName: data.destName, depth: data.depth });
    }

    nllc.states = { ...(json.states ?? {}) };
};

// --- applySnapshot: the diff-and-ramp reconciler behind /recall ---------

// Ramps (if durationSeconds > 0) or instantly sets (deferred to startTime
// either way) a single NLLCParam toward targetValue — the one place
// applySnapshot decides between scheduleRamp and setInstant, exactly the
// choice commands.js's applyParams makes for a console ramp.
function rampOrSet(nllc, param, targetValue, { startTime, durationSeconds }) {
    const target = param.encode(param.clamp(targetValue));
    if (durationSeconds > 0) {
        scheduleRamp(nllc.audioContext, param.audioParam, param.audioParam.value, target, durationSeconds, { startTime });
    } else {
        setInstant(nllc.audioContext, param.audioParam, target, startTime);
    }
};

function applyParamsSnapshot(nllc, paramsMap, targetValues = {}, opts) {
    for (const [key, value] of Object.entries(targetValues)) {
        const param = paramsMap[key];
        if (param) rampOrSet(nllc, param, value, opts);
    }
};

// Reconciles one channel's insert chain against a target processor list:
// matched processors (same name+type) ramp their params in place and keep
// their identity; anything only in the target is created, anything only
// live is torn down, and the chain is rebuilt in the target's order — all
// three as one structural pass deferred to startTime, since none of that can
// ride native AudioParam scheduling. Matched params still ramp immediately
// (scheduling a future AudioParam value doesn't require the node to already
// be connected into the graph by the time it's scheduled, only by the time
// it fires — which the same deferred pass guarantees).
function reconcileProcessors(nllc, channel, targetList, { startTime, durationSeconds }) {
    const key = (p) => `${p.type}:${p.name}`;
    const targetKeys = new Set(targetList.map(key));
    const toRemove = channel.processors.filter((p) => !targetKeys.has(key(p)));

    const finalOrder = targetList.map((data) => {
        let processor = channel.processors.find((p) => key(p) === `${data.type}:${data.name}`);
        if (!processor) processor = nllc.createProcessor(data.type, { name: data.name, ...data.options });
        applyParamsSnapshot(nllc, processor.params, data.params, { startTime, durationSeconds });
        return { processor, active: data.active, data };
    });

    scheduleAt(nllc.audioContext, startTime, () => {
        for (const processor of toRemove) nllc.removeProcessor(processor);
        for (const processor of [...channel.processors]) channel.removeProcessor(processor.id);
        for (const { processor, active, data } of finalOrder) {
            processor.active = active;
            // A matched processor keeps its identity, so its saved options
            // (a reverb's IR duration) and automation don't arrive via the
            // constructor the way a freshly-created one's do — apply both
            // here, in the same structural pass. Harmless duplication for a
            // fresh processor (its constructor already consumed them).
            applyOptionsSnapshot(processor, data.options);
            processor.automation = rebuildAutomation(processor, data.automation);
            channel.addProcessor(processor);
        }
    });
};

// Sends are a secondary routing detail (not a direct sound source the way a
// channel's own gain is), so unlike processors/channels there's no fade
// choreography here — matched sends' gain still ramps, but add/remove is a
// plain structural swap at startTime.
function reconcileSends(nllc, channel, targetList, { startTime }) {
    scheduleAt(nllc.audioContext, startTime, () => {
        const targetByName = new Map(targetList.map((s) => [s.destName, s]));
        for (const send of [...channel.sends]) {
            if (!targetByName.has(send.destName)) channel.removeSend(send.id);
        }
        for (const data of targetList) {
            const existing = channel.sends.find((send) => send.destName === data.destName);
            if (existing) existing.params.gain.set(data.gain);
            else {
                const destObject = nllc._resolveObject(data.destName);
                if (destObject) channel.addSend(destObject, { destName: data.destName, gain: data.gain });
            }
        }
    });
};

function reconcileMaster(nllc, data, opts) {
    applyParamsSnapshot(nllc, nllc.master.params, data.params, opts);
    reconcileProcessors(nllc, nllc.master, data.processors ?? [], opts);
    scheduleAt(nllc.audioContext, opts.startTime, () => {
        nllc.master.automation = rebuildAutomation(nllc.master, data.automation);
    });
};

// Reconciles a named list of channels (tracks or buses) against a target
// snapshot list: matched channels (by name) ramp gain/pan/processors/sends
// in place; a channel only in the target is created now and its gain
// ramped up from 0 (a fade-in); a channel only live has its gain ramped
// down to 0 and is torn down once that fade completes (a fade-out) rather
// than cut instantly. `onMatch`/create are the one bit that differs between
// a track (which also needs its synth's type/params/events/active handled)
// and a bare bus.
function reconcileChannelList(nllc, live, targetList, { create, remove, onMatch }, opts) {
    const targetByName = new Map(targetList.map((data) => [data.name, data]));

    for (const channel of [...live]) {
        const data = targetByName.get(channel.name);
        if (!data) {
            rampOrSet(nllc, channel.params.gain, 0, opts);
            scheduleAt(nllc.audioContext, opts.startTime + opts.durationSeconds, () => remove(channel));
            continue;
        }

        const { gain: _gain, ...restParams } = data.params;
        applyParamsSnapshot(nllc, channel.params, restParams, opts);
        rampOrSet(nllc, channel.params.gain, data.params.gain, opts);
        reconcileProcessors(nllc, channel, data.processors ?? [], opts);
        if (data.sends) reconcileSends(nllc, channel, data.sends, opts);
        scheduleAt(nllc.audioContext, opts.startTime, () => {
            channel.automation = rebuildAutomation(channel, data.automation);
        });
        onMatch?.(channel, data, opts);
    }

    for (const data of targetList) {
        if (live.some((c) => c.name === data.name)) continue;
        scheduleAt(nllc.audioContext, opts.startTime, () => {
            const channel = create(data);
            const instantOpts = { startTime: opts.startTime, durationSeconds: 0 };
            const { gain: targetGain, ...restParams } = data.params;

            channel.params.gain.set(0);
            applyParamsSnapshot(nllc, channel.params, restParams, instantOpts);
            reconcileProcessors(nllc, channel, data.processors ?? [], instantOpts);
            if (data.sends) reconcileSends(nllc, channel, data.sends, instantOpts);
            channel.automation = rebuildAutomation(channel, data.automation);
            rampOrSet(nllc, channel.params.gain, targetGain, opts);
            onMatch?.(channel, data, instantOpts);
        });
    }
};

function reconcileModulators(nllc, targetList, opts) {
    const targetByName = new Map(targetList.map((data) => [data.name, data]));

    for (const modulator of [...nllc.modulators]) {
        const data = targetByName.get(modulator.name);
        if (!data) {
            scheduleAt(nllc.audioContext, opts.startTime + opts.durationSeconds, () => nllc.removeModulator(modulator));
        } else {
            applyParamsSnapshot(nllc, modulator.params, data.params, opts);
            scheduleAt(nllc.audioContext, opts.startTime, () => {
                applyOptionsSnapshot(modulator, data.options);
                modulator.automation = rebuildAutomation(modulator, data.automation);
            });
        }
    }

    for (const data of targetList) {
        if (nllc.modulators.some((m) => m.name === data.name)) continue;
        scheduleAt(nllc.audioContext, opts.startTime, () => {
            const modulator = nllc.createModulator(data.type, { name: data.name, ...data.options });
            applyParamsSnapshot(nllc, modulator.params, data.params, { startTime: opts.startTime, durationSeconds: 0 });
            modulator.automation = rebuildAutomation(modulator, data.automation);
        });
    }
};

// Patches don't have their own name, just a (sourceName, destName) pair —
// used as the matching key. A patch whose endpoint is also disappearing
// this same reconcile (a removed track/bus/modulator/processor) gets
// cascade-removed by that object's own removeTrack/removeBus/
// removeModulator/removeProcessor call, same as it would from the console —
// this function only needs to handle a patch appearing/disappearing on its
// own, both endpoints staying put.
function reconcilePatches(nllc, targetList, opts) {
    const key = (p) => `${p.sourceName}→${p.destName}`;
    const targetByKey = new Map(targetList.map((data) => [key(data), data]));

    for (const patch of [...nllc.patches]) {
        const data = targetByKey.get(key(patch));
        if (!data) {
            // An event patch (no depth) has nothing to fade — it's removed
            // outright once the fade window elapses, same timing either way.
            if (patch.params.depth) rampOrSet(nllc, patch.params.depth, 0, opts);
            scheduleAt(nllc.audioContext, opts.startTime + opts.durationSeconds, () => nllc.removePatch(patch));
        } else if (patch.params.depth) {
            rampOrSet(nllc, patch.params.depth, data.depth, opts);
        }
    }

    for (const data of targetList) {
        if (nllc.patches.some((p) => key(p) === key(data))) continue;
        scheduleAt(nllc.audioContext, opts.startTime, () => {
            const patch = nllc.createPatch({ sourceName: data.sourceName, destName: data.destName, depth: 0 });
            if (patch.params.depth) rampOrSet(nllc, patch.params.depth, data.depth, opts);
        });
    }
};

// Reconciles the live session toward `snapshot` (shaped like
// snapshotSession's output) without a hard cut: matching objects ramp,
// appearing objects fade in, disappearing objects fade out then get torn
// down — see the module doc comment and reconcileChannelList above for the
// fade choreography. `startTime` defaults to right now; `durationSeconds`
// (default 0) is how long every ramp/fade takes — 0 means every change is
// still deferred to `startTime` but happens as an instant jump, not a ramp.
export function applySnapshot(nllc, snapshot, { startTime, durationSeconds = 0 } = {}) {
    const t0 = startTime ?? nllc.audioContext.currentTime;
    const opts = { startTime: t0, durationSeconds };

    if (snapshot.clock) {
        if (durationSeconds > 0 && snapshot.clock.bpm !== nllc.clock.bpm) {
            nllc.clock.rampBpm(snapshot.clock.bpm, durationSeconds, { startTime: t0 });
        } else {
            scheduleAt(nllc.audioContext, t0, () => nllc.clock.setBpm(snapshot.clock.bpm));
        }
        scheduleAt(nllc.audioContext, t0, () => nllc.clock.setLoopLengthBeats(snapshot.clock.loopLengthBeats));
    }

    if (snapshot.harmony) {
        scheduleAt(nllc.audioContext, t0, () => {
            nllc.harmony.root = snapshot.harmony.root;
            nllc.harmony.scale = [...snapshot.harmony.scale];
        });
    }

    if (snapshot.master) reconcileMaster(nllc, snapshot.master, opts);

    reconcileChannelList(nllc, nllc.buses, snapshot.buses ?? [], {
        create: (data) => nllc.createBus({ name: data.name }),
        remove: (bus) => nllc.removeBus(bus),
    }, opts);

    reconcileChannelList(nllc, nllc.tracks, snapshot.tracks ?? [], {
        create: (data) => nllc.createTrack({ name: data.name, synth: data.synth.type, ...data.synth.options }),
        remove: (track) => nllc.removeTrack(track),
        onMatch: (track, data, matchOpts) => {
            // Ramping synth params only makes sense when the synth the
            // snapshot describes is the one that's live — if the type
            // changed since the save (/lead synth=sampler after saving it
            // as an oscsynth), the whole synth is swapped back in the
            // deferred block below instead, params applied to the fresh
            // instance there.
            const typeMatches = track.source.type === data.synth.type;
            if (typeMatches) {
                for (const [key, value] of Object.entries(data.synth.params)) {
                    if (track.source.params[key]) rampOrSet(nllc, track.source.params[key], value, matchOpts);
                }
            }
            // Param ramps above ride native AudioParam scheduling, but a
            // synth swap and an events/active/options change are plain JS
            // mutations the clock reads on its next tick — left immediate,
            // a /recall ... at=cycle would switch patterns the moment Enter
            // is pressed while everything else correctly waits for the
            // boundary. Same setTimeout compromise every other structural
            // change here makes.
            scheduleAt(nllc.audioContext, matchOpts.startTime, () => {
                if (!typeMatches) {
                    nllc.setTrackSynth(track, data.synth.type, data.synth.options);
                    for (const [key, value] of Object.entries(data.synth.params)) {
                        track.source.params[key]?.set(value);
                    }
                } else {
                    applyOptionsSnapshot(track.source, data.synth.options);
                }
                track.source.active = data.active;
                track.source.events = data.synth.events.map((event) => new NLLCEvent(event));
            });
        },
    }, opts);

    reconcileModulators(nllc, snapshot.modulators ?? [], opts);
    reconcilePatches(nllc, snapshot.patches ?? [], opts);
};
