// The volatile half of the prompt: what the session looks like *right now*.
//
// The prompt has two halves, split by how often they change, and they live in
// different places for that reason:
//
//   static   Who the assistant is, what ribbit is, how to answer, worked
//            examples. Editable markdown in `static/context/`, assembled
//            server-side ($lib/server/llm/context.js). Byte-identical across
//            turns, so it sits at the front where a provider can cache it.
//   volatile This file. The live audio graph, rebuilt per question and
//            folded into the *user* turn rather than the system prompt —
//            partly to keep that cached prefix intact, and partly because
//            Claude's CLI fixes a session's system prompt at creation time
//            while `--resume` carries the conversation on past it.
//
// Rendered as compact text rather than the raw session JSON. Same
// information, roughly 40% of the tokens: JSON spends most of its bytes on
// punctuation and repeated keys, and there is nothing here a model parses
// better as JSON than as a table.

import { snapshotSession } from "ribbit";

// Enough precision to be meaningful for a cutoff or a gain, short enough that
// forty of them still read as a table.
function num(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
};

// Params render inline as `a=1 b=2`. Capped because a czsynth carries far
// more of them than are worth spending context on before anyone has asked
// about that track specifically.
function params(record, limit = 12) {
    const entries = Object.entries(record ?? {});
    if (entries.length === 0) return "";
    const shown = entries.slice(0, limit).map(([key, value]) => `${key}=${num(value)}`);
    if (entries.length > limit) shown.push(`…+${entries.length - limit}`);
    return shown.join(" ");
};

function processors(list) {
    if (!list?.length) return "";
    return ` processors:[${list.map((p) => `${p.name}(${p.type})`).join(" ")}]`;
};

function sends(list) {
    if (!list?.length) return "";
    return ` sends:[${list.map((s) => `${s.destName}@${num(s.gain)}`).join(" ")}]`;
};

function flags(entry) {
    const set = [];
    if (entry.muted) set.push("muted");
    if (entry.soloed) set.push("soloed");
    if (entry.active === false) set.push("stopped");
    return set.length ? ` (${set.join(", ")})` : "";
};

// The live graph as text. Rendered from snapshotSession rather than walked by
// hand so it can't drift from what /save_session writes — if the engine gains
// a field, this sees it.
export function describeSession(engine) {
    const snapshot = snapshotSession(engine);
    const lines = [];

    const running = engine.audioContext?.state === "running";
    lines.push(`transport: ${num(snapshot.clock.bpm)} bpm, ${num(snapshot.clock.loopLengthBeats)}-beat cycle, ${running ? "playing" : "stopped"}`);
    lines.push(`harmony: root=${snapshot.harmony.root} scale=[${snapshot.harmony.scale.join(",")}]`);
    lines.push(`master: ${params(snapshot.master.params)}${processors(snapshot.master.processors)}`);

    if (snapshot.tracks.length) {
        lines.push(`tracks (${snapshot.tracks.length}):`);
        for (const track of snapshot.tracks) {
            lines.push(`  ${track.name} [${track.synth.type}]${flags(track)} ${params(track.synth.params)}`
                + ` | channel: ${params(track.params, 6)}${processors(track.processors)}${sends(track.sends)}`
                + ` | ${track.synth.events.length} events`);
        }
    }

    if (snapshot.buses.length) {
        lines.push(`buses (${snapshot.buses.length}):`);
        for (const bus of snapshot.buses) {
            lines.push(`  ${bus.name}${flags(bus)} ${params(bus.params, 6)}${processors(bus.processors)}${sends(bus.sends)}`);
        }
    }

    if (snapshot.modulators.length) {
        lines.push(`modulators (${snapshot.modulators.length}):`);
        for (const modulator of snapshot.modulators) {
            lines.push(`  ${modulator.name} [${modulator.type}] ${params(modulator.params)}`);
        }
    }

    if (snapshot.patches.length) {
        lines.push(`patches (${snapshot.patches.length}):`);
        for (const patch of snapshot.patches) {
            const depth = patch.depth === undefined ? "" : ` depth=${num(patch.depth)}`;
            lines.push(`  ${patch.sourceName} -> ${patch.destName}${depth}`);
        }
    }

    if (snapshot.groups?.length) {
        lines.push(`groups (${snapshot.groups.length}):`);
        for (const group of snapshot.groups) lines.push(`  ${group.name}: ${group.members.join(", ")}`);
    }

    const states = Object.keys(engine.states ?? {});
    if (states.length) lines.push(`saved states: ${states.join(", ")}`);

    if (snapshot.tracks.length === 0 && snapshot.buses.length === 0 && snapshot.modulators.length === 0) {
        lines.push("(empty session — nothing but master)");
    }

    return lines.join("\n");
};

// The user turn: volatile state first, question last. Ordering is deliberate
// — a provider that caches on a prefix match gets the stable half of the
// prompt to work with, and the question stays adjacent to the state it was
// asked about.
export function buildUserTurn(question, sessionText) {
    if (!sessionText) return question;
    return `<session-state>\n${sessionText}\n</session-state>\n\n${question}`;
};
