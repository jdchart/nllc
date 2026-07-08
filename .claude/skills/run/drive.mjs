#!/usr/bin/env node
// Drives the NLLC app in headless Chromium and runs a list of console
// commands against it, printing each command's echoed output plus any
// browser console errors. One browser launch, one page, every command in
// the same session — see SKILL.md in this directory for why that matters
// and what to touch if the app's shape changes underneath this script.
//
// Usage:
//   node .claude/skills/run/drive.mjs commands.json
//   echo '["/add_track name=t1", "/t1"]' | node .claude/skills/run/drive.mjs -
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.NLLC_DEV_PORT ?? 5173;
const BASE_URL = `http://localhost:${PORT}`;
const APP_URL = `${BASE_URL}/code-editor`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const DEV_LOG = "/tmp/nllc-dev-server.log";

async function isUp(url) {
    try {
        const res = await fetch(url);
        return res.ok || res.status < 500;
    } catch {
        return false;
    }
}

// Reuses an already-running dev server if one answers on PORT (the common
// case within one Claude session: start it once, run this script many
// times against it) rather than paying a fresh Vite cold-start every call.
async function ensureDevServer() {
    if (await isUp(BASE_URL)) return;

    console.error(`[drive] no dev server on :${PORT}, starting one (log: ${DEV_LOG})`);
    const out = openSync(DEV_LOG, "a");
    const child = spawn("npm", ["run", "dev"], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: ["ignore", out, out],
        env: { ...process.env, PORT: String(PORT) },
    });
    child.unref();

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (await isUp(BASE_URL)) return;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`dev server did not come up within 30s — check ${DEV_LOG}`);
}

function loadCommands() {
    const arg = process.argv[2];
    if (!arg) {
        throw new Error("usage: drive.mjs <commands.json | ->");
    }
    const raw = arg === "-" ? readFileSync(0, "utf8") : readFileSync(arg, "utf8");
    return JSON.parse(raw);
}

const commands = loadCommands();
await ensureDevServer();

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.goto(APP_URL, { waitUntil: "networkidle" });
    // The console's own text input — see CodeEditor.svelte's `.input-row
    // input`. If that markup changes, update this selector (and the
    // `.console .line` one below, which is every logged line, input and
    // output alike).
    await page.waitForSelector(".input-row input");

    for (const cmd of commands) {
        await page.fill(".input-row input", cmd);
        await page.press(".input-row input", "Enter");
        // executeCommand is synchronous; this just gives Svelte a tick to
        // render the new log line before reading it back.
        await page.waitForTimeout(80);
        const lines = await page.$$eval(".console .line", (els) => els.map((el) => el.textContent));
        console.log(`> ${cmd}\n  ${lines[lines.length - 1]}\n`);
    }

    console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
} finally {
    await browser.close();
}
