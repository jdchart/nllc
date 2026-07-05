<script>
    import { onMount } from "svelte";
    import CodeEditor from "$lib/components/code-editor/CodeEditor.svelte";
    import Mixer from "$lib/components/mixer/Mixer.svelte";
    import { NLLC } from "$lib/scripts/nllc-src/nllc";
    import { NLLCEvent } from "$lib/scripts/nllc-src/event";
    import { NLLCAutomationEvent } from "$lib/scripts/nllc-src/automation";

    let nllc_instance = $state(null);
    let synths = $state([]);

    // NLLC touches AudioContext, which doesn't exist during SSR,
    // so it's constructed client-side only, inside onMount.
    onMount(() => {
        const nllc = new NLLC();

        const reverb = nllc.createReverb({ wet: 0.35 });
        const synth = nllc.createSynth(reverb, { name: "lead" });

        [0, 1, 2, 3].forEach((beat) => {
            synth.addEvent(new NLLCEvent({ beat, pitch: 48 + beat * 2, velocity: 0.5, duration: 0.5 }));
        });

        // fade the synth in over the first 4 beats, then hold at full volume
        synth.addAutomation(new NLLCAutomationEvent({
            beat: 0,
            duration: 4,
            target: synth.volume,
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
        synths = nllc.synths;
    });

    function handleCommand(text) {
        return `unrecognized: "${text}" (LLM routing not wired up yet)`;
    };
</script>

<div class="layout">
    <div class="console-pane">
        <CodeEditor onCommand={handleCommand} />
    </div>
    <div class="mixer-pane">
        {#if nllc_instance}
            <Mixer audioContext={nllc_instance.audioContext} master={nllc_instance.master} {synths} />
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
        border-right: 1px solid var(--nllc-border);
    }

    .mixer-pane {
        flex: 1;
        min-width: 0;
    }
</style>
