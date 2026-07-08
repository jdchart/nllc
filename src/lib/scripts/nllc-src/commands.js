import { scheduleRamp } from "./automation";
import { NLLCEvent } from "./event";

// Coerces a raw parsed token into a number, boolean, or (quote-stripped)
// string. Falls through to the raw string for anything else (e.g. a bare
// type name like `sampler` in `synth=sampler`).
function parseValue(raw) {
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    if (raw === "true") return true;
    if (raw === "false") return false;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1);
    }
    return raw;
};

// Turns a bare "3" or "4b" trailing a param's value into { amount, unit }:
// no suffix means seconds, a "b" suffix means beats.
function parseDuration(raw) {
    const match = raw.match(/^(\d+(?:\.\d+)?)(b)?$/);
    return { amount: Number(match[1]), unit: match[2] ? "beats" : "seconds" };
};

// Parses "/name" or "/name param=val param2=val2" into { name, params }.
// Values are bare (no spaces) or quoted (may contain spaces): param="foo bar".
// Whitespace around "=" is optional: "param = val" and "param =val" both work.
// A value may be followed by a bare duration token (e.g. "gain=0 3" or
// "gain=0 4b") to mean "ramp to this value over 3 seconds / 4 beats" instead
// of setting it instantly — see commands that opt into ramping (isRamp()).
// Such params parse to { value, duration, unit } instead of a plain scalar.
export function parseCommand(text) {
    const match = text.trim().match(/^\/([a-zA-Z_]\w*)(?:\s+([\s\S]*))?$/);
    if (!match) {
        throw new Error(`invalid command syntax: "${text}"`);
    }

    const [, name, argsText] = match;
    const params = {};

    if (argsText) {
        // A bare token with no "=" (e.g. "help") is a boolean flag: params.help = true.
        // The duration group only applies inside an "=value" match (nested in
        // that group), so a bare flag can never swallow a following number.
        const pairPattern = /([a-zA-Z_]\w*)(?:\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S*)(?:\s+(\d+(?:\.\d+)?b?)(?=\s|$))?)?/g;
        let cursor = 0;
        let pair;
        while ((pair = pairPattern.exec(argsText))) {
            if (argsText.slice(cursor, pair.index).trim()) {
                throw new Error(`invalid parameter near "${argsText.slice(cursor, pair.index).trim()}" in /${name} ...`);
            }
            const [, key, rawValue, rawDuration] = pair;
            if (rawValue === undefined) {
                params[key] = true;
            } else if (rawDuration !== undefined) {
                const { amount, unit } = parseDuration(rawDuration);
                params[key] = { value: parseValue(rawValue), duration: amount, unit };
            } else {
                params[key] = parseValue(rawValue);
            }
            cursor = pairPattern.lastIndex;
        }
        if (argsText.slice(cursor).trim()) {
            throw new Error(`invalid parameter near "${argsText.slice(cursor).trim()}" in /${name} ...`);
        }
    }

    return { name, params };
};

// True for a parsed param carrying a ramp duration (see parseCommand).
function isRamp(value) {
    return typeof value === "object" && value !== null && "duration" in value;
};

// Converts a ramp spec's duration to seconds, resolving a "beats" unit
// against the clock's current tempo.
function rampSeconds(clock, spec) {
    return spec.unit === "beats" ? spec.duration * clock.secondsPerBeat : spec.duration;
};

// Resolves a command's "at=" scheduling hint into an absolute AudioContext
// startTime for scheduleRamp: "beat" anchors to the next beat boundary,
// "cycle" to the next loop boundary, and omitting it means "right now"
// (startTime undefined, which scheduleRamp itself defaults to currentTime).
// An unrecognized value falls back to "right now" with a warning to surface.
function resolveStartTime(clock, at) {
    if (at === "beat") return { startTime: clock.nextBeatTime(), label: "next beat" };
    if (at === "cycle") return { startTime: clock.nextCycleTime(), label: "next cycle" };
    if (at !== undefined) return { warning: `unknown at="${at}" (expected "beat" or "cycle"), starting now` };
    return {};
};

// Converts a user-supplied value to a finite number, throwing (rather than
// silently producing NaN) so a bad command surfaces as an error via run()'s
// catch and never corrupts persistent engine state (e.g. clock.bpm sticking
// at NaN forever, poisoning every future beat calculation).
function toNumber(raw, label) {
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        throw new Error(`invalid number for ${label}: "${raw}"`);
    }
    return num;
};

// Writes a value onto an AudioParam at a specific (possibly future) time
// instead of assigning .value directly, so at=beat/at=cycle can defer a
// plain (non-ramped) set the same way it already defers a ramp's start.
function setInstant(audioContext, param, value, startTime) {
    const time = startTime ?? audioContext.currentTime;
    param.cancelScheduledValues(time);
    param.setValueAtTime(value, time);
};

function formatValue(value) {
    return typeof value === "number" ? value.toFixed(3) : String(value);
};

// The one place that knows how to get/set/ramp/defer a param (an NLLCParam —
// see param.js) against a parsed command value. Shared by channelCommand
// (gain/pan), paramObjectCommand (every processor/modulator param), and the
// /patch command (depth) — previously each of these had its own hand-rolled
// copy of this ramp/instant/at= branching, which is exactly the kind of
// duplication that lets one of them quietly fall out of sync with the rest.
// `paramsMap` is whatever `.params` the target object exposes; `input` is the
// full parsed command params (not just the rampable ones) — anything in
// `input` that isn't a key of `paramsMap` is either reported as unknown
// (`reportUnknown: true`, the default — appropriate when paramsMap is an
// object's *entire* param surface, e.g. a processor/modulator) or silently
// left alone for the caller's own handling (`reportUnknown: false` — e.g.
// channelCommand, which has plenty of other non-param keys like add_event).
function applyParams(nllc, paramsMap, input, { startTime, label }, { reportUnknown = true } = {}) {
    const results = [];
    for (const [key, spec] of Object.entries(input)) {
        if (key === "at") continue;
        const param = paramsMap[key];
        if (!param) {
            if (reportUnknown) results.push(`unknown param "${key}"`);
            continue;
        }

        if (isRamp(spec)) {
            const target = param.clamp(toNumber(spec.value, key));
            const seconds = rampSeconds(nllc.clock, spec);
            scheduleRamp(nllc.audioContext, param.audioParam, param.audioParam.value, param.encode(target), seconds, { startTime });
            results.push(`${key} ramping to ${formatValue(target)} over ${seconds.toFixed(2)}s${label ? ` (${label})` : ""}`);
        } else {
            const target = param.clamp(toNumber(spec, key));
            if (startTime !== undefined) {
                // Same raw-AudioParam route the ramp branch uses, so a plain
                // set can also be deferred to at=beat/at=cycle.
                setInstant(nllc.audioContext, param.audioParam, param.encode(target), startTime);
                results.push(`${key}=${formatValue(target)} (${label})`);
            } else {
                param.set(target);
                results.push(`${key}=${formatValue(target)}`);
            }
        }
    }
    return results;
};

// Builds the one-line status string for a channel (master or a track), shown
// both for `/track_1` with no params and inside `/tracks`.
function channelSummary(channel) {
    const gain = `gain=${channel.params.gain.get().toFixed(2)}`;
    const pan = `pan=${channel.params.pan.get().toFixed(2)}`;
    const inserts = channel.processors.length
        ? channel.processors.map((p) => `${p.id}:${p.name}${p.active ? "" : "(off)"}`).join(", ")
        : "none";
    // For now the source can't be introspected further, but surface what it
    // is so this is a natural place for that control to grow into.
    const synth = channel.source
        ? ` synth=${channel.source.name}("${channel.source.llm_summary}")${channel.source.active ? "" : " (stopped)"}`
        : "";
    return `${channel.name} — ${gain} ${pan} inserts=[${inserts}]${synth}`;
};

// Every track (and master) is addressable by its own name, e.g. /track_1 gain=0.5.
// gain is a 0-1 position, exponentially tapered onto the actual AudioParam; pan is
// linear -1..1. Either can instead be ramped by giving a trailing duration, e.g.
// /track_1 gain=0 3 (over 3 seconds) or gain=0 4b (over 4 beats). A set (ramped
// or not) starts right now by default; add at=beat or at=cycle to defer it to the
// next beat/loop boundary instead, e.g. /track_1 gain=0 3 at=cycle, or
// /track_1 gain=0 at=cycle for an instant (unramped) change that still waits for
// the boundary. add_processor/
// remove_processor manage the insert chain at runtime. add_event appends an
// NLLCEvent to the track's synth (beat=/pitch=|degree=/velocity=/duration=, each
// optional); clear_events empties its pattern. start/stop pause a track's own
// synth (its events stop scheduling) without touching routing; master has no synth,
// so start/stop/synth/add_event/clear_events are no-ops there.
function channelCommand(nllc, channel, params) {
    if (Object.keys(params).length === 0) return channelSummary(channel);

    if (params.remove_self) {
        if (channel === nllc.master) return "cannot remove the master channel";
        nllc.removeTrack(channel);
        return `${channel.name} removed`;
    }

    const { startTime, label, warning } = resolveStartTime(nllc.clock, params.at);
    const results = warning ? [warning] : [];

    // gain/pan go through the exact same param machinery every processor,
    // modulator, and patch uses (see applyParams) — reportUnknown: false
    // since `params` also carries channel-specific keys (add_event, start,
    // synth=, ...) that aren't rampable params at all.
    results.push(...applyParams(nllc, channel.params, params, { startTime, label }, { reportUnknown: false }));

    if (params.add_event) {
        if (!channel.source) {
            results.push("master has no synth");
        } else {
            const event = new NLLCEvent({
                beat: toNumber(params.beat ?? 0, "beat"),
                pitch: params.pitch !== undefined ? toNumber(params.pitch, "pitch") : undefined,
                degree: params.degree !== undefined ? toNumber(params.degree, "degree") : undefined,
                velocity: params.velocity !== undefined ? toNumber(params.velocity, "velocity") : undefined,
                duration: params.duration !== undefined ? toNumber(params.duration, "duration") : undefined,
            });
            channel.source.addEvent(event);
            results.push(`event added to ${channel.source.name} at beat ${event.beat}`);
        }
    }

    if (params.clear_events) {
        if (!channel.source) {
            results.push("master has no synth");
        } else {
            channel.source.events = [];
            results.push(`${channel.source.name} events cleared`);
        }
    }

    if (params.start) {
        if (!channel.source) {
            results.push("master cannot be started/stopped");
        } else {
            channel.source.active = true;
            results.push(`${channel.name} started`);
        }
    }

    if (params.stop) {
        if (!channel.source) {
            results.push("master cannot be started/stopped");
        } else {
            channel.source.active = false;
            results.push(`${channel.name} stopped`);
        }
    }

    if ("synth" in params) {
        if (!channel.source) {
            results.push("master has no synth");
        } else {
            try {
                nllc.setTrackSynth(channel, params.synth);
                results.push(`synth set to ${params.synth}`);
            } catch (error) {
                results.push(error.message);
            }
        }
    }

    if ("add_processor" in params) {
        const processor = nllc.createProcessor(params.add_processor);
        channel.addProcessor(processor);
        results.push(`added ${processor.name} (${processor.id})`);
    }

    if ("remove_processor" in params) {
        const removed = channel.removeProcessor(params.remove_processor);
        results.push(removed
            ? `removed ${params.remove_processor}`
            : `no processor "${params.remove_processor}" on ${channel.name}`);
    }

    return results.length ? results.join("; ") : channelSummary(channel);
};

// One-line help/status text shared by processorCommand and modulatorCommand:
// name (+ id, if it has one, e.g. a processor's "p1") and llm_summary, plus
// every current param value.
function paramObjectSummary(object) {
    const paramList = Object.entries(object.params)
        .map(([key, param]) => `${key}=${formatValue(param.get())}`)
        .join(", ");
    const idSuffix = object.id ? ` (${object.id})` : "";
    return `${object.name}${idSuffix}: ${object.llm_summary} [${paramList}]`;
};

// Shared by processorCommand and modulatorCommand: both are addressed by
// their own name (e.g. /reverb wet=0.5, /lfo1 freq=3) and expose the same
// generic surface — a `.params` map of NLLCParam (see param.js). This
// function has no per-type knowledge of reverb/delay/lfo/etc.; every key in
// `params` is expected to be one of `object`'s own params (reportUnknown
// defaults to true), ramped/set/deferred by applyParams exactly the same way
// a track's gain/pan is. `removeSelf` is the one bit that differs between
// the two object kinds (nllc.removeProcessor vs. nllc.removeModulator).
function paramObjectCommand(nllc, object, params, removeSelf) {
    if (params.remove_self) {
        removeSelf();
        return `${object.name} removed`;
    }

    if (params.help || Object.keys(params).length === 0) {
        return paramObjectSummary(object);
    }

    const { startTime, label, warning } = resolveStartTime(nllc.clock, params.at);
    const results = warning ? [warning] : [];
    results.push(...applyParams(nllc, object.params, params, { startTime, label }));
    return `${object.name}: ${results.join(", ")}`;
};

function processorCommand(nllc, processor, params) {
    return paramObjectCommand(nllc, processor, params, () => nllc.removeProcessor(processor));
};

// A modulator (e.g. an lfo) is addressable by its own name exactly like a
// processor, e.g. /lfo1 freq=3 or /lfo1 help — see paramObjectCommand. It
// never sits in a channel's chain, so there's no add_processor-style
// insert/remove-from-chain step; removing one just tears the modulator (and
// any patch touching it) down (see nllc.removeModulator).
function modulatorCommand(nllc, modulator, params) {
    return paramObjectCommand(nllc, modulator, params, () => nllc.removeModulator(modulator));
};

// One-line summary for /patches, e.g. "x1: lfo1 -> reverb.wet (depth 0.30)".
function patchSummary(patch) {
    return `${patch.id}: ${patch.sourceName} -> ${patch.destName} (depth ${patch.depth.value.toFixed(2)})`;
};

// Builds the single executeCommand(text) function the UI calls for every
// console submission. Closes over one NLLC instance; holds no state of its
// own, since dispatch (track/processor name lookup) is re-resolved on every
// call against the live nllc.tracks/nllc.processors arrays.
export function createCommandRouter(nllc) {
    const commands = {
        start: () => {
            nllc.start();
            return "engine started";
        },
        stop: () => {
            nllc.stop();
            return "engine stopped";
        },
        add_track: (params) => {
            const track = nllc.createTrack(params);
            return `created ${track.name}`;
        },
        tracks: () => {
            if (nllc.tracks.length === 0) return "no tracks";
            return nllc.tracks.map((track) => channelSummary(track)).join("\n");
        },
        // bpm can be ramped the same way a track's gain/processor's wet can
        // (/clock bpm=140 8, optionally at=beat|cycle) — see NLLCClock.rampBpm
        // for why that needs its own stepped timer rather than riding a native
        // AudioParam ramp. num_beats is deliberately not rampable (a
        // fractional, constantly-shifting loop length has no sensible
        // meaning), so a ramp spec there is rejected with a message.
        clock: (params) => {
            if (!("bpm" in params) && !("num_beats" in params)) {
                return `bpm=${nllc.clock.bpm} num_beats=${nllc.clock.loopLengthBeats}`;
            }

            const results = [];
            const { startTime, label, warning } = resolveStartTime(nllc.clock, params.at);
            if (warning) results.push(warning);

            if ("bpm" in params) {
                const spec = params.bpm;
                if (isRamp(spec)) {
                    const target = toNumber(spec.value, "bpm");
                    const seconds = rampSeconds(nllc.clock, spec);
                    nllc.clock.rampBpm(target, seconds, { startTime });
                    results.push(`bpm ramping to ${target} over ${seconds.toFixed(2)}s${label ? ` (${label})` : ""}`);
                } else {
                    nllc.clock.setBpm(toNumber(spec, "bpm"));
                    results.push(`bpm set to ${nllc.clock.bpm}`);
                }
            }

            if ("num_beats" in params) {
                const spec = params.num_beats;
                if (isRamp(spec)) {
                    results.push(`num_beats can't be ramped — use num_beats=<number>`);
                } else {
                    nllc.clock.setLoopLengthBeats(toNumber(spec, "num_beats"));
                    results.push(`num_beats set to ${nllc.clock.loopLengthBeats}`);
                }
            }

            return results.join("; ");
        },
        add_modulator: (params) => {
            const { type, ...options } = params;
            const modulator = nllc.createModulator(type ?? "lfo", options);
            return `created ${modulator.name}`;
        },
        modulators: () => {
            if (nllc.modulators.length === 0) return "no modulators";
            return nllc.modulators.map(paramObjectSummary).join("\n");
        },
        // A patch is its own standalone thing — a "cable" from any named
        // object's raw output (a modulator, but also a track/master/processor,
        // whose signal can double as a CV source) into any other object's
        // param (name.param, e.g. "reverb.wet", "track_1.gain", "lfo1.freq"),
        // through its own depth (attenuator), independent of both endpoints —
        // see nllc.createPatch/NLLCPatch. /patch source=... dest=... depth=...
        // creates one; /patch id=<id> depth=... adjusts an existing patch's
        // depth afterward (ramp/at= supported the same way any param is).
        patch: (params) => {
            if ("id" in params) {
                const patchObj = nllc.patches.find((p) => p.id === params.id);
                if (!patchObj) return `no patch "${params.id}"`;
                if (!("depth" in params)) return patchSummary(patchObj);

                const { id: _id, ...depthParams } = params;
                const { startTime, label, warning } = resolveStartTime(nllc.clock, depthParams.at);
                const results = warning ? [warning] : [];
                results.push(...applyParams(nllc, patchObj.params, depthParams, { startTime, label }));
                return `${patchObj.id} ${results.join(", ")}`;
            }

            if (!("source" in params) || !("dest" in params)) {
                return `usage: /patch source=<name> dest=<name.param> depth=<0-1> (default 1); adjust later with /patch id=<id> depth=...`;
            }

            const depth = toNumber(params.depth ?? 1, "depth");
            const patchObj = nllc.createPatch({ sourceName: params.source, destName: params.dest, depth });
            return `patched ${patchObj.sourceName} -> ${patchObj.destName} (depth ${patchObj.depth.value.toFixed(2)}) [${patchObj.id}]`;
        },
        unpatch: (params) => {
            if (!("id" in params)) return `usage: /unpatch id=<id>`;
            const patchObj = nllc.patches.find((p) => p.id === params.id);
            if (!patchObj) return `no patch "${params.id}"`;
            nllc.removePatch(patchObj);
            return `${params.id} removed`;
        },
        patches: () => {
            if (nllc.patches.length === 0) return "no patches";
            return nllc.patches.map(patchSummary).join("\n");
        },
    };

    // Wraps a handler so a thrown error becomes a console-printable string
    // instead of crashing the session — handlers don't need their own
    // try/catch.
    function run(name, handler, params) {
        try {
            return handler(params) ?? "";
        } catch (error) {
            return `error running /${name}: ${error.message}`;
        }
    };

    // Dispatch order: built-in top-level commands, then master, then a
    // matching track name, then a matching processor name, then a matching
    // modulator name.
    function executeOne(text) {
        if (!text.trim().startsWith("/")) {
            return `unrecognized: "${text}" (commands must start with /)`;
        }

        let name, params;
        try {
            ({ name, params } = parseCommand(text));
        } catch (error) {
            return error.message;
        }

        if (commands[name]) return run(name, commands[name], params);

        if (name === "master") return run(name, (p) => channelCommand(nllc, nllc.master, p), params);

        const track = nllc.tracks.find((t) => t.name === name);
        if (track) return run(name, (p) => channelCommand(nllc, track, p), params);

        const processor = nllc.processors.find((p) => p.name === name);
        if (processor) return run(name, (p) => processorCommand(nllc, processor, p), params);

        const modulator = nllc.modulators.find((m) => m.name === name);
        if (modulator) return run(name, (p) => modulatorCommand(nllc, modulator, p), params);

        return `unknown command: /${name}`;
    };

    // Splits one submitted line into multiple "/name ..." segments so
    // several targets can be set off together, e.g.
    // "/track_1 gain=0 8 /reverb wet=0.9 6b" runs both in the same call
    // stack (and so schedules off the same audioContext.currentTime).
    // Assumes no param value contains a literal "/" — none currently do.
    function splitCommands(text) {
        const starts = [];
        const commandStart = /\/[a-zA-Z_]\w*/g;
        let match;
        while ((match = commandStart.exec(text))) starts.push(match.index);

        if (starts.length <= 1) return [text.trim()].filter(Boolean);
        return starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length).trim());
    };

    // The single entry point the UI calls for every console submission.
    return function executeCommand(text) {
        const segments = splitCommands(text);
        if (segments.length === 0) return `unrecognized: "${text}" (commands must start with /)`;
        return segments.map(executeOne).join("\n");
    };
};
