<script>
    // The console+mixer page shell shared by /code-editor (a blank session)
    // and /code-editor/<slug> (the same shell, auto-loading
    // static/sessions/<slug>.json — see session.js's loadSession). Neither
    // route hand-authors any content of its own; a fresh session starts
    // truly empty (just master), and opening a saved one just means "fetch a
    // session.json and load it" the same way /load_session does from a
    // picked file, minus the file picker.
    import { onMount } from "svelte";
    import CodeEditor from "$lib/components/code-editor/CodeEditor.svelte";
    import Mixer from "$lib/components/mixer/Mixer.svelte";
    import CollapsedRail from "$lib/components/mixer/CollapsedRail.svelte";
    import { Ribbit, createCommandRouter, loadSession, RESERVED_NAMES } from "ribbit";
    import { beginDrag } from "$lib/scripts/drag.js";
    import { LlmSession, parseLlmCommand, formatMeta, describeContext, LLM_MODEL_KEY } from "$lib/scripts/llm.js";

    // `/llm` is this app's command, not the engine's, so the engine's own
    // guard against an object shadowing a command name doesn't know about it.
    // Adding it here means /add_track name=llm renames itself the same way it
    // would for /add_track — without it, a track called `llm` would sit
    // permanently unaddressable behind the dispatcher below.
    RESERVED_NAMES.add("llm");

    let { sessionUrl = null, title = "NLLC // Session" } = $props();

    let nllc_instance = $state(null);
    let tracks = $state([]);
    let buses = $state([]);
    let modulators = $state([]);
    let patches = $state([]);
    let engineExecute = $state((text) => `unrecognized: "${text}" (engine not ready yet)`);
    let engineSuggest = $state(() => null);
    let sessionError = $state("");
    let codeEditor;
    let llm = null;

    // ── The /llm command ────────────────────────────────────────────────
    // Intercepted here rather than registered with createCommandRouter,
    // because the engine's router is the wrong shape for prose: it splits a
    // submitted line at every "/word" it finds and parses the rest as key=value
    // pairs. `/llm how do I sidechain the pad?` would be torn into fragments
    // before any handler saw it. Dispatching first also keeps engine commands
    // out of the LLM queue — `/kick stop` must never wait behind a question.

    function dispatch(text) {
        const command = parseLlmCommand(text);
        return command ? handleLlm(command) : engineExecute(text);
    };

    function dispatchSuggest(input, cursorPos) {
        // Past `/llm `, the line is a sentence. Completing a word in it would
        // be wrong on its own terms, and actively destructive here: the
        // console accepts *and submits* ghost text on Enter, so a question
        // mentioning "/reverb" would submit something else entirely.
        if (input.trimStart().startsWith("/llm ")) return null;

        // The engine gets first refusal, so `/l` still completes to
        // `/load_session` rather than being shadowed by this.
        const engineMatch = engineSuggest(input, cursorPos);
        if (engineMatch) return engineMatch;

        const trimmed = input.trim();
        if (cursorPos === input.length && trimmed.length > 1 && trimmed !== "/llm" && "/llm".startsWith(trimmed)) {
            return { start: input.indexOf("/") + 1, end: cursorPos, full: "llm" };
        }
        return null;
    };

    async function handleLlm({ action, question }) {
        if (action === "reset") return llm.reset();
        if (action === "stop") { const result = llm.stop(); tick(); return result; }
        if (action === "context") return describeContext(nllc_instance).catch((error) => error.message);
        if (action === "status" || !question) return llm.status();

        const stream = codeEditor.beginStream();
        const startedAt = Date.now();
        let label = "";
        let streaming = false;

        stream.note("thinking…");
        startTicker();

        try {
            const { meta } = await llm.ask(question, {
                onQueued: (position) => stream.note(`queued — ${position} ahead`),
                onStart: ({ provider, model }) => { label = `${provider}:${model}`; stream.note(`${label} · thinking…`); },
                // A thinking model's scratchpad is never printed — it's the
                // model's working, not its answer. It's only used as proof of
                // life while nothing else is arriving.
                onReasoning: () => { if (!streaming) stream.note(`${label} · reasoning…`); },
                // First token clears the "thinking…" note — from here on the
                // arriving text is its own evidence that something is happening.
                onDelta: (text) => {
                    if (!streaming) { streaming = true; stream.note(""); }
                    stream.push(text);
                },
            }, { withContext: action !== "bare" });

            stream.finish(formatMeta(meta) || `${label} · ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        } catch (error) {
            stream.fail(error.message);
        } finally {
            tick();
        }

        // The answer is already in the scrollback as a streamed line, so
        // there's nothing for the console to log on top of it.
        return "";
    };

    // The input row's working indicator, driven while anything is in flight.
    // Polled rather than event-driven because the useful part is the elapsed
    // second count, which nothing but the clock can report.
    let statusTimer = null;
    let workStartedAt = 0;

    function tick() {
        if (!llm || (!llm.busy && llm.queue.length === 0)) {
            clearInterval(statusTimer);
            statusTimer = null;
            workStartedAt = 0;
            codeEditor?.setStatus("");
            return;
        }
        const elapsed = ((Date.now() - workStartedAt) / 1000).toFixed(1);
        const queued = llm.queue.length;
        codeEditor?.setStatus(`⋯ llm working — ${elapsed}s${queued ? ` · ${queued} queued` : ""} · /llm --stop to cancel`);
    };

    function startTicker() {
        if (!workStartedAt) workStartedAt = Date.now();
        if (statusTimer) return;
        statusTimer = setInterval(tick, 200);
        tick();
    };

    // Passed down through Mixer to every clickable name/param label
    // (MixerChannel, ModulatorStrip) so clicking one pastes it into the
    // console at the current cursor position instead of the user having to
    // type it out.
    function insertIntoConsole(text) {
        codeEditor?.insertAtCursor(text);
    };

    // Passed down to Transport's Save/Load buttons so they run the exact
    // same /save_json /load_json commands the console would, with the
    // result showing up in the scrollback like any typed command instead of
    // succeeding/failing silently.
    function runConsoleCommand(text) {
        codeEditor?.runCommand(text);
    };

    let mixerVisible = $state(true);
    let mixerWidth = $state(360);
    let resizing = $state(false);

    function startResize(event) {
        if (!mixerVisible) return;
        const endDrag = beginDrag(event);

        const startX = event.clientX;
        const startWidth = mixerWidth;
        resizing = true;

        function onMove(moveEvent) {
            mixerWidth = Math.min(800, Math.max(220, startWidth + (startX - moveEvent.clientX)));
        };

        function onUp() {
            resizing = false;
            endDrag();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    // Ribbit touches AudioContext, which doesn't exist during SSR,
    // so it's constructed client-side only, inside onMount.
    onMount(() => {
        // Audio options set on the homepage (see routes/+page.svelte) —
        // latencyHint only takes effect at AudioContext construction time,
        // so it has to be read before `new Ribbit(...)`; the output device
        // (sinkId) can be applied any time after. Both are best-effort: no
        // saved prefs, an unsupported browser, or a since-unplugged device
        // id should all just fall back to the platform default rather than
        // failing session startup.
        const latencyHint = localStorage.getItem("nllc:audioLatencyHint") || undefined;
        const outputDeviceId = localStorage.getItem("nllc:audioOutputDeviceId");

        const nllc = new Ribbit({ latencyHint });
        if (outputDeviceId && typeof nllc.audioContext.setSinkId === "function") {
            nllc.audioContext.setSinkId(outputDeviceId).catch(() => {});
        }

        // Where output from at=beat/at=cycle work lands once it actually
        // fires — the engine has no other way to reach the console after a
        // command has returned. Unset, the engine falls back to console.log,
        // so this is the difference between a deferred failure being visible
        // in the app and only in devtools.
        nllc.onMessage = (text, kind) => codeEditor?.appendOutput(text, kind);

        nllc_instance = nllc;
        const router = createCommandRouter(nllc);
        engineExecute = router.executeCommand;
        engineSuggest = router.suggest;

        // The natural-language layer. The model is read per turn from
        // localStorage (written by the homepage dropdown) rather than
        // captured here, so changing the selection takes effect on the next
        // question instead of on the next page load.
        llm = new LlmSession({
            engine: nllc,
            getModel: () => localStorage.getItem(LLM_MODEL_KEY) || "",
        });

        // Dev-only debug handle. The console's text output is the whole
        // verification surface for engine work (see .claude/skills/run), and
        // some engine state has no text form at all — a param's *modulated*
        // value, a node's connections. This is how a smoke test reaches it
        // without inventing a console command whose only user is the test.
        // Guarded by import.meta.env.DEV, so it never ships in a build.
        if (import.meta.env.DEV) window.nllc = nllc;
        // Same seam, same reason, for the LLM layer: queue depth, remembered
        // history and the provider-side conversation id have no console text
        // form beyond the summary `/llm --status` prints, and a smoke test
        // needs to see them directly. Dev-only, like the handle above.
        if (import.meta.env.DEV) window.nllcLlm = llm;

        if (sessionUrl) {
            // A URL segment that doesn't match a real file is now reachable by
            // hand (/code-editor/anything), and a 404 returns HTML that fails
            // in .json() rather than at fetch — so check `ok` explicitly and
            // report the failure on the page. Without this the result is an
            // apparently-normal empty session, indistinguishable from asking
            // for a blank one.
            fetch(sessionUrl)
                .then((response) => {
                    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                    return response.json();
                })
                .then((json) => loadSession(nllc, json))
                .catch((error) => {
                    sessionError = `Couldn't load ${sessionUrl} — ${error.message}. This session is empty.`;
                    console.error(`SessionPage: failed to load session "${sessionUrl}"`, error);
                });
        }

        // nllc.tracks/buses/modulators/patches are plain (non-reactive) arrays
        // mutated by console commands (/add_track, /add_bus, /add_modulator,
        // /patch, .../remove_self, /unpatch) and by loadSession above; poll
        // and diff each so the mixer picks up additions/removals, same
        // pattern MixerChannel already uses for its processor list.
        // Diffed by element identity, not by joined names/ids — loading a
        // session whose object names match what's already live (e.g. the
        // same file twice) replaces every object with a fresh instance while
        // leaving the name list byte-identical, and a name-based diff would
        // keep the mixer's strips bound to the torn-down originals.
        const arraysDiffer = (live, current) =>
            live.length !== current.length || live.some((item, i) => item !== current[i]);
        let rafId;
        const poll = () => {
            if (arraysDiffer(nllc.tracks, tracks)) tracks = [...nllc.tracks];
            if (arraysDiffer(nllc.buses, buses)) buses = [...nllc.buses];
            if (arraysDiffer(nllc.modulators, modulators)) modulators = [...nllc.modulators];
            if (arraysDiffer(nllc.patches, patches)) patches = [...nllc.patches];

            rafId = requestAnimationFrame(poll);
        };
        poll();

        // Client-side navigation (hitting back to the homepage) unmounts this
        // component but leaves the AudioContext and the clock's setTimeout
        // loop running — the engine isn't owned by the DOM, so it has to be
        // torn down explicitly or the session keeps playing on the next page.
        return () => {
            cancelAnimationFrame(rafId);
            // An in-flight question outlives this component the same way the
            // AudioContext does — it's a fetch the browser is holding open
            // (and, for the claude provider, a child process on the far end).
            clearInterval(statusTimer);
            llm?.stop();
            nllc.dispose();
        };
    });
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

{#if sessionError}
    <div class="session-error" role="alert">
        <span>{sessionError}</span>
        <button onclick={() => sessionError = ""} aria-label="Dismiss">×</button>
    </div>
{/if}

<div class="layout">
    <div class="console-pane">
        <CodeEditor bind:this={codeEditor} onCommand={dispatch} onSuggest={dispatchSuggest} />
    </div>

    <div
        class="divider"
        role="separator"
        aria-orientation="vertical"
        onpointerdown={startResize}
        class:collapsed={!mixerVisible}
    >
        <button
            class="collapse-toggle"
            onclick={() => mixerVisible = !mixerVisible}
            onpointerdown={(event) => event.stopPropagation()}
            aria-label={mixerVisible ? "Hide mixer" : "Show mixer"}
        >
            {mixerVisible ? "›" : "‹"}
        </button>
    </div>

    <div class="mixer-pane" class:resizing style="width: {mixerVisible ? mixerWidth : 44}px">
        {#if nllc_instance}
            {#if mixerVisible}
                <Mixer nllc={nllc_instance} {tracks} {buses} {modulators} {patches} onInsert={insertIntoConsole} onRunCommand={runConsoleCommand} />
            {:else}
                <CollapsedRail nllc={nllc_instance} />
            {/if}
        {/if}
    </div>
</div>

<style>
    .session-error {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: var(--nllc-panel-bg);
        border-bottom: 1px solid var(--nllc-meter-hot);
        color: var(--nllc-meter-hot);
        font-family: var(--nllc-font-mono);
        font-size: 0.8rem;
    }

    .session-error span {
        flex: 1;
    }

    .session-error button {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
    }

    .layout {
        display: flex;
        height: 100vh;
    }

    .console-pane {
        flex: 1;
        min-width: 0;
    }

    .divider {
        flex-shrink: 0;
        width: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nllc-border);
        cursor: col-resize;
    }

    .divider.collapsed {
        cursor: pointer;
    }

    .collapse-toggle {
        width: 18px;
        height: 40px;
        border: 1px solid var(--nllc-border);
        background: var(--nllc-panel-bg);
        color: var(--nllc-text-dim);
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.9rem;
        line-height: 1;
    }

    .mixer-pane {
        flex-shrink: 0;
        min-width: 0;
        overflow: hidden;
        transition: width 150ms ease;
    }

    .mixer-pane.resizing {
        transition: none;
    }
</style>
