<script>
    import MixerChannel from "./MixerChannel.svelte";
    import Transport from "./Transport.svelte";

    let { nllc, tracks = [] } = $props();

    // "track_1" (the command name) -> "Track 1" (the strip label)
    function formatLabel(name) {
        return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };
</script>

<div class="mixer">
    <Transport {nllc} />

    <div class="strips">
        {#each tracks as track (track)}
            <MixerChannel label={formatLabel(track.name)} audioContext={nllc.audioContext} channel={track} />
        {/each}
    </div>

    <div class="master-strip">
        <MixerChannel label="Master" audioContext={nllc.audioContext} channel={nllc.master} />
    </div>
</div>

<style>
    .mixer {
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
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
