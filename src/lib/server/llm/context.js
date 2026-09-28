// The editable context folder: static/context/*.md, concatenated into the
// system prompt on every question.
//
// This is the hand on how the assistant behaves. Everything in that folder is
// always injected, in filename order — a flat pile, no manifest, no
// registration step. Drop a file in, ask the next question, it's in the
// prompt. Numeric prefixes exist only to control ordering.
//
// Read fresh per request rather than cached. The files are a few kB and the
// call they precede takes seconds, so the syscalls are free — and the payoff
// is that editing a rule and re-asking picks it up with no dev-server
// restart, which is the entire point of the folder being editable.
//
// It lives in static/ (rather than src/lib/) for two reasons: it's content
// rather than code, and being served means you can also read what the model
// is reading at /context/<file>.md in a browser tab.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const CONTEXT_DIR = process.env.NLLC_CONTEXT_DIR
    // Resolved against the process cwd, which is the nllc/ package under
    // `vite dev` and `vite preview`. A deployed build copies static/ next to
    // the server bundle instead, so set NLLC_CONTEXT_DIR there — this app is
    // a local tool and the dev-server path is the one that matters.
    ?? path.join(process.cwd(), "static", "context");

// Two exclusions, both by convention so no config file is needed:
// README.md documents the folder to a human, and a leading "_" is the
// escape hatch for parking a file without deleting it.
function isInjected(filename) {
    if (!filename.endsWith(".md")) return false;
    if (filename.startsWith("_") || filename.startsWith(".")) return false;
    return filename.toLowerCase() !== "readme.md";
};

// Bytes/4 is the usual rough token heuristic. Reported rather than computed
// exactly because the point is a budget you can watch while editing, not an
// accounting figure — and the real tokenizer differs per model anyway.
export function approxTokens(bytes) {
    return Math.round(bytes / 4);
};

// [{ name, bytes, text }], filename order. Returns [] rather than throwing
// when the folder is missing — an absent context folder is a valid state
// (the assistant just knows less), not a reason to fail the question.
export async function loadContextFiles() {
    let entries;
    try {
        entries = await readdir(CONTEXT_DIR);
    } catch {
        return [];
    }

    const names = entries.filter(isInjected).sort();

    return Promise.all(names.map(async (name) => {
        const full = path.join(CONTEXT_DIR, name);
        const [text, info] = await Promise.all([readFile(full, "utf8"), stat(full)]);
        return { name, bytes: info.size, text };
    }));
};

// The assembled system prompt. Each file is fenced with its own filename so
// the model can tell one document from the next — without it, a rules file
// and an examples file run together into one ambiguous wall.
export async function buildSystemPrompt() {
    const files = await loadContextFiles();
    if (files.length === 0) {
        return "You are the assistant built into nllc, a browser console for live-coding music with the ribbit audio engine.";
    }

    return files
        .map((file) => `===== ${file.name} =====\n${file.text.trim()}`)
        .join("\n\n");
};

// What /llm --context reports: what's loaded and what it costs, without the
// contents. The budget is the thing worth watching while editing the folder.
export async function describeContext() {
    const files = await loadContextFiles();
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    return {
        dir: CONTEXT_DIR,
        files: files.map(({ name, bytes }) => ({ name, bytes, approxTokens: approxTokens(bytes) })),
        totalBytes,
        approxTokens: approxTokens(totalBytes),
    };
};
