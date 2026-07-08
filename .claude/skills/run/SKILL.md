---
name: run
description: Launch and drive the NLLC app (SvelteKit console) in headless Chromium to smoke-test console commands end-to-end. Use whenever a change to nllc-src or the console/mixer UI needs verifying by actually running commands, not just svelte-check.
---

# Running NLLC for a smoke test

NLLC is a browser app (SvelteKit + Web Audio) driven by typing `/commands`
into a text console. "Running" it means: start the Vite dev server, drive a
headless Chromium against `/code-editor`, type commands into the console
input, and read back what it echoes. There is no need to actually hear
audio to verify engine/command-router logic — the console's own text
output already proves whether a command did what it should (created an
object, changed a param, produced the right error, cascaded a removal,
etc.). Only reach for real audio verification (see the "sandbox has no
live audio rendering" note below) when the thing in question is genuinely
about audio correctness (a ramp curve, a filter's frequency response).

## Use the driver script, don't write a fresh Playwright script each time

`.claude/skills/run/drive.mjs` is a reusable driver: it starts the dev
server if one isn't already up (reusing it if it is), launches Chromium
once, opens `/code-editor`, and runs a whole list of console commands in
one page session, printing each command's echoed output plus any browser
console errors.

```bash
echo '[
  "/add_track name=t1",
  "/add_bus name=bus1",
  "/t1 add_send=bus1 send_gain=0.4",
  "/t1"
]' | node .claude/skills/run/drive.mjs -

# or from a file:
node .claude/skills/run/drive.mjs /tmp/my-commands.json
```

Write the command list fresh for whatever you're actually verifying this
session — the script is the (stable) driver, the command list is the
(disposable) test case. Don't accumulate a growing fixed regression suite
here; that's what an actual test framework would be for, and this project
doesn't have one (console-output smoke checks only).

## Why this is fast (and how to keep it that way)

Two things previously made this slow, both fixed:

1. **Playwright is a real devDependency** (`npm install -D playwright`,
   pinned to the version whose bundled Chromium matches what's already
   cached at `~/Library/Caches/ms-playwright`), not resolved through
   `npx` on every invocation. Bare `npx playwright` hits the registry to
   check for a newer version before running, which is most of the
   slowness; `npx playwright@<pinned-version>` avoids that but still adds
   npx's own resolution overhead. Importing straight from
   `node_modules/playwright` (what `drive.mjs` does) has neither problem.
2. **One browser launch per test run, not one per assertion.** Cold-launching
   Chromium is the single biggest fixed cost here (still ~1-2s even
   warm) — pay it once per script run and drive every command for that
   session through the same page, rather than a fresh script/launch per
   command.

Typical timing: ~1.3s for a warm run (dev server already up), ~2.3s cold
(driver auto-starts Vite too). If `npm install` in this repo ever removes
or re-pins the `playwright` devDependency, or the local Chromium cache is
cleared, the first run after that will need to actually download a
browser (slower, one-time) — that's expected, not a regression in this
script.

## What's stable vs. what needs to change as the project evolves

This skill has two layers with different lifetimes:

**Stable (the driver mechanics) — shouldn't need touching for ordinary
feature work:**
- Dev server start/readiness-poll logic.
- Chromium launch/page/console-error wiring.
- The `.input-row input` selector (the console's text input) and
  `.console .line` selector (every logged line, input and output alike) —
  these come from `CodeEditor.svelte`. **Do** update `drive.mjs` if that
  component's markup/classes change (e.g. a redesign), or if the route
  path (`/code-editor`) moves.

**Disposable (the actual test case) — expected to change every time:**
- The command list itself. New commands/params (e.g. this session's
  `/add_bus`, `out=`, `add_send=`) mean the *commands you type* change,
  not the driver. Write whatever list actually exercises the feature
  you're verifying; don't try to maintain one "canonical" list that
  covers everything ever built, since the command vocabulary here is
  still actively growing (see `docs/llm/overview.md`'s command surface
  section for the current full vocabulary).

If the project moves to a real automated test framework (e.g. Vitest unit
tests directly against `nllc-src` classes) for anything beyond
console-level smoke checks, that would live alongside this, not replace
it — this skill's whole value is verifying the *console → command router →
live audio graph* path end-to-end, which a unit test importing `NLLC`
directly wouldn't cover the same way.

## Known environment limitation

Headless Chromium in this sandbox does not render real-time audio (a
known-audible track's level meter reads 0% the whole time; native
`AudioParam` ramps never progress `.value` on live read-back). This
doesn't affect the command-router smoke-testing above since it only reads
the console's text output, never audio levels. If you specifically need
to verify Web Audio automation correctness (a ramp curve, a filter
response), use `OfflineAudioContext` batch-rendering instead of live
playback — see memory / prior session notes for the pattern.
