<script>
    import { onMount } from "svelte";
    import CodeEditor from "$lib/components/code-editor/CodeEditor.svelte";
    import Mixer from "$lib/components/mixer/Mixer.svelte";
    import CollapsedRail from "$lib/components/mixer/CollapsedRail.svelte";
    import { NLLC } from "$lib/scripts/nllc-src/nllc";
    import { NLLCEvent } from "$lib/scripts/nllc-src/event";
    import { NLLCAutomationEvent } from "$lib/scripts/nllc-src/automation";
    import { createCommandRouter } from "$lib/scripts/nllc-src/commands";

    let nllc_instance = $state(null);
    let tracks = $state([]);
    let executeCommand = $state((text) => `unrecognized: "${text}" (engine not ready yet)`);

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

    // NLLC touches AudioContext, which doesn't exist during SSR,
    // so it's constructed client-side only, inside onMount.
    onMount(() => {
        const nllc = new NLLC();

        const track = nllc.createTrack({ name: "track_1" });
        const reverb = nllc.createProcessor("reverb", { wet: 0.35 });
        track.addProcessor(reverb);

        const synth = track.source;

        [0, 1, 2, 3].forEach((beat) => {
            synth.addEvent(new NLLCEvent({ beat, pitch: 48 + beat * 2, velocity: 0.5, duration: 0.5 }));
        });

        // fade the track in over the first 4 beats, then hold at full volume
        track.addAutomation(new NLLCAutomationEvent({
            beat: 0,
            duration: 4,
            target: track.volume,
            from: 0,
            to: 1,
            curve: "linear",
            once: true,
        }));

        // slowly open up the reverb over the first 8 beats
        reverb.addAutomation(new NLLCAutomationEvent({
            beat: 0,
            duration: 8,
            target: reverb.wet,
            from: 0.05,
            to: 0.5,
            curve: "linear",
            once: true,
        }));

        nllc_instance = nllc;
        tracks = [...nllc.tracks];
        executeCommand = createCommandRouter(nllc);

        // nllc.tracks is a plain (non-reactive) array mutated by /add_track and
        // /track_1 remove_self; poll and diff so the mixer picks up the change,
        // same pattern MixerChannel already uses for its processor list.
        let trackNames = nllc.tracks.map((t) => t.name).join(",");
        let rafId;
        const pollTracks = () => {
            const names = nllc.tracks.map((t) => t.name).join(",");
            if (names !== trackNames) {
                trackNames = names;
                tracks = [...nllc.tracks];
            }
            rafId = requestAnimationFrame(pollTracks);
        };
        pollTracks();

        return () => cancelAnimationFrame(rafId);
    });
</script>

<div class="layout">
    <div class="console-pane">
        <CodeEditor onCommand={executeCommand} />
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
                <Mixer nllc={nllc_instance} {tracks} />
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
