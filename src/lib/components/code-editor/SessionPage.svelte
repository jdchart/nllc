<script>
    // The console+mixer page shell shared by both /code-editor (a blank
    // session) and /code-editor/demo (the same shell, auto-loading
    // static/sessions/demo.json — see session.js's loadSession). Neither
    // route hand-authors any demo content of its own anymore; a fresh
    // session starts truly empty (just master), and "demo" just means
    // "fetch a session.json and load it" the same way /load_session does
    // from a picked file, minus the file picker.
    import { onMount } from "svelte";
    import CodeEditor from "$lib/components/code-editor/CodeEditor.svelte";
    import Mixer from "$lib/components/mixer/Mixer.svelte";
    import CollapsedRail from "$lib/components/mixer/CollapsedRail.svelte";
    import { Ribbit, createCommandRouter, loadSession } from "ribbit";

    let { demoSessionUrl = null, title = "NLLC // Session" } = $props();

    let nllc_instance = $state(null);
    let tracks = $state([]);
    let buses = $state([]);
    let modulators = $state([]);
    let patches = $state([]);
    let executeCommand = $state((text) => `unrecognized: "${text}" (engine not ready yet)`);
    let suggest = $state(() => null);
    let codeEditor;

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
        event.preventDefault();

        const startX = event.clientX;
        const startWidth = mixerWidth;
        resizing = true;

        function onMove(moveEvent) {
            mixerWidth = Math.min(800, Math.max(220, startWidth + (startX - moveEvent.clientX)));
        };

        function onUp() {
            resizing = false;
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

        nllc_instance = nllc;
        ({ executeCommand, suggest } = createCommandRouter(nllc));

        if (demoSessionUrl) {
            fetch(demoSessionUrl)
                .then((response) => response.json())
                .then((json) => loadSession(nllc, json))
                .catch((error) => console.error(`SessionPage: failed to load demo session "${demoSessionUrl}"`, error));
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

        return () => cancelAnimationFrame(rafId);
    });
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<div class="layout">
    <div class="console-pane">
        <CodeEditor bind:this={codeEditor} onCommand={executeCommand} onSuggest={suggest} />
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
