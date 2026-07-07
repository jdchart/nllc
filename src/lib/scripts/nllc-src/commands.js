import { positionToGain, gainToPosition } from "./taper";

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

// Parses "/name" or "/name param=val param2=val2" into { name, params }.
// Values are bare (no spaces) or quoted (may contain spaces): param="foo bar".
// Whitespace around "=" is optional: "param = val" and "param =val" both work.
export function parseCommand(text) {
    const match = text.trim().match(/^\/([a-zA-Z_]\w*)(?:\s+([\s\S]*))?$/);
    if (!match) {
        throw new Error(`invalid command syntax: "${text}"`);
    }

    const [, name, argsText] = match;
    const params = {};

    if (argsText) {
        // A bare token with no "=" (e.g. "help") is a boolean flag: params.help = true.
        const pairPattern = /([a-zA-Z_]\w*)(?:\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S*))?/g;
        let cursor = 0;
        let pair;
        while ((pair = pairPattern.exec(argsText))) {
            if (argsText.slice(cursor, pair.index).trim()) {
                throw new Error(`invalid parameter near "${argsText.slice(cursor, pair.index).trim()}" in /${name} ...`);
            }
            const [, key, rawValue] = pair;
            params[key] = rawValue === undefined ? true : parseValue(rawValue);
            cursor = pairPattern.lastIndex;
        }
        if (argsText.slice(cursor).trim()) {
            throw new Error(`invalid parameter near "${argsText.slice(cursor).trim()}" in /${name} ...`);
        }
    }

    return { name, params };
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
// linear -1..1. add_processor/remove_processor manage the insert chain at runtime.
// start/stop pause a track's own synth (its events stop scheduling) without touching
// routing; master has no synth, so start/stop/synth are no-ops there.
function channelCommand(nllc, channel, params) {
    if (Object.keys(params).length === 0) return channelSummary(channel);

    if (params.remove_self) {
        if (channel === nllc.master) return "cannot remove the master channel";
        nllc.removeTrack(channel);
        return `${channel.name} removed`;
    }

    const results = [];

    if ("gain" in params) {
        const clamped = clamp(0, 1, Number(params.gain));
        channel.volume.value = positionToGain(clamped);
        results.push(`gain set to ${clamped.toFixed(2)}`);
    }

    if ("pan" in params) {
        const clamped = clamp(-1, 1, Number(params.pan));
        channel.pan.value = clamped;
        results.push(`pan set to ${clamped.toFixed(2)}`);
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
// exposes — this function has no per-type knowledge of reverb/delay/etc.
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
    for (const [key, value] of Object.entries(params)) {
        if (!(key in processor.params)) {
            results.push(`unknown param "${key}"`);
            continue;
        }
        processor.params[key].set(Number(value));
        results.push(`${key}=${value}`);
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
    return function executeCommand(text) {
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
};
