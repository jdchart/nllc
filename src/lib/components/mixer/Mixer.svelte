<script>
    import MixerChannel from "./MixerChannel.svelte";

    let { audioContext, master, synths = [] } = $props();
</script>

<div class="mixer">
    <div class="strips">
        {#each synths as synth (synth)}
            <MixerChannel label={synth.name} {audioContext} node={synth.output} />
        {/each}
    </div>

    <div class="master-strip">
        <MixerChannel label="Master" {audioContext} node={master} />
    </div>
</div>

<style>
    .mixer {
        display: flex;
        height: 100%;
        background: var(--nllc-panel-bg);
        padding: 1rem;
        gap: 1rem;
        overflow-x: auto;
    }

    .strips {
        display: flex;
        gap: 0.5rem;
        flex: 1;
    }

    .master-strip {
        border-left: 1px solid var(--nllc-border);
        padding-left: 1rem;
    }
</style>
