import { positionToGain, gainToPosition } from "./taper";
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

function clamp(min, max, value) {
    return Math.max(min, Math.min(max, value));
};

function formatValue(value) {
    return typeof value === "number" ? value.toFixed(3) : String(value);
};

// Builds the one-line status string for a channel (master or a track), shown
// both for `/track_1` with no params and inside `/tracks`.
function channelSummary(channel) {
    const gain = `gain=${gainToPosition(channel.volume.value).toFixed(2)}`;
    const pan = `pan=${channel.pan.value.toFixed(2)}`;
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
// /track_1 gain=0 3 (over 3 seconds) or gain=0 4b (over 4 beats). A ramp starts
// right now by default; add at=beat or at=cycle to defer its start to the next
// beat/loop boundary instead, e.g. /track_1 gain=0 3 at=cycle. add_processor/
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

    const results = [];
    const { startTime, label, warning } = resolveStartTime(nllc.clock, params.at);
    if (warning) results.push(warning);

    if ("gain" in params) {
        const spec = params.gain;
        if (isRamp(spec)) {
            const clamped = clamp(0, 1, Number(spec.value));
            const seconds = rampSeconds(nllc.clock, spec);
            scheduleRamp(nllc.audioContext, channel.volume, channel.volume.value, positionToGain(clamped), seconds, { startTime });
            results.push(`gain ramping to ${clamped.toFixed(2)} over ${seconds.toFixed(2)}s${label ? ` (${label})` : ""}`);
        } else {
            const clamped = clamp(0, 1, Number(spec));
            channel.volume.value = positionToGain(clamped);
            results.push(`gain set to ${clamped.toFixed(2)}`);
        }
    }

    if ("pan" in params) {
        const spec = params.pan;
        if (isRamp(spec)) {
            const clamped = clamp(-1, 1, Number(spec.value));
            const seconds = rampSeconds(nllc.clock, spec);
            scheduleRamp(nllc.audioContext, channel.pan, channel.pan.value, clamped, seconds, { startTime });
            results.push(`pan ramping to ${clamped.toFixed(2)} over ${seconds.toFixed(2)}s${label ? ` (${label})` : ""}`);
        } else {
            const clamped = clamp(-1, 1, Number(spec));
            channel.pan.value = clamped;
            results.push(`pan set to ${clamped.toFixed(2)}`);
        }
    }

    if (params.add_event) {
        if (!channel.source) {
            results.push("master has no synth");
        } else {
            const event = new NLLCEvent({
                beat: Number(params.beat ?? 0),
                pitch: params.pitch !== undefined ? Number(params.pitch) : undefined,
                degree: params.degree !== undefined ? Number(params.degree) : undefined,
                velocity: params.velocity !== undefined ? Number(params.velocity) : undefined,
                duration: params.duration !== undefined ? Number(params.duration) : undefined,
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

// A processor is addressable by its own name, e.g. /reverb wet=0.5 or /reverb help.
// Generic over whatever `processor.params` the concrete processor class
// exposes — this function has no per-type knowledge of reverb/delay/etc. Any
// param can be ramped the same way as a track's gain/pan (see channelCommand),
// including the at=beat/at=cycle scheduling hint.
function processorCommand(nllc, processor, params) {
    if (params.remove_self) {
        nllc.removeProcessor(processor);
        return `${processor.name} removed`;
    }

    if (params.help || Object.keys(params).length === 0) {
        const paramList = Object.entries(processor.params)
            .map(([key, param]) => `${key}=${formatValue(param.get())}`)
            .join(", ");
        return `${processor.name} (${processor.id}): ${processor.llm_summary} [${paramList}]`;
    }

    const results = [];
    const { startTime, label, warning } = resolveStartTime(nllc.clock, params.at);
    if (warning) results.push(warning);

    for (const [key, value] of Object.entries(params)) {
        if (key === "at") continue;
        if (!(key in processor.params)) {
            results.push(`unknown param "${key}"`);
            continue;
        }
        if (isRamp(value)) {
            const seconds = rampSeconds(nllc.clock, value);
            // processor[key] exposes the raw AudioParam (e.g. reverb.wet),
            // distinct from processor.params[key].get()/.set() which only
            // read/write the instant value.
            scheduleRamp(nllc.audioContext, processor[key], processor.params[key].get(), Number(value.value), seconds, { startTime });
            results.push(`${key} ramping to ${value.value} over ${seconds.toFixed(2)}s${label ? ` (${label})` : ""}`);
        } else {
            processor.params[key].set(Number(value));
            results.push(`${key}=${value}`);
        }
    }
    return `${processor.name}: ${results.join(", ")}`;
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
        clock: (params) => {
            const results = [];
            if ("bpm" in params) {
                nllc.clock.setBpm(Number(params.bpm));
                results.push(`bpm set to ${nllc.clock.bpm}`);
            }
            if ("num_beats" in params) {
                nllc.clock.setLoopLengthBeats(Number(params.num_beats));
                results.push(`num_beats set to ${nllc.clock.loopLengthBeats}`);
            }
            if (results.length === 0) {
                return `bpm=${nllc.clock.bpm} num_beats=${nllc.clock.loopLengthBeats}`;
            }
            return results.join("; ");
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
    // matching track name, then a matching processor name.
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
