<script>
    // The full mixer pane: a transport strip, one MixerChannel per track, and
    // a master strip. Purely a read/write view onto the live NLLC graph
    // (each MixerChannel operates directly on its channel's real Web Audio
    // nodes) — `tracks`/`modulators`/`patches` are handed down from the
    // parent page, which is the one place polling nllc's plain arrays for
    // additions/removals. Labels are always the object's own name (e.g.
    // "track_1"), never a prettified guess at one — that name is also what
    // addresses it from the console, so the two should always match.
    import MixerChannel from "./MixerChannel.svelte";
    import Transport from "./Transport.svelte";
    import ModulatorStrip from "./ModulatorStrip.svelte";
    import PatchList from "./PatchList.svelte";

    let { nllc, tracks = [], buses = [], modulators = [], patches = [], onInsert = () => {} } = $props();
</script>

<div class="mixer">
    <Transport {nllc} />

    <div class="tracks-section">
        <div class="title">Tracks</div>
        {#if tracks.length === 0}
            <div class="empty">none</div>
        {:else}
            <div class="strips">
                {#each tracks as track (track)}
                    <MixerChannel label={track.name} audioContext={nllc.audioContext} channel={track} onRemove={(t) => nllc.removeTrack(t)} {onInsert} />
                {/each}
            </div>
        {/if}
    </div>

    <div class="buses-section">
        <div class="title">Buses</div>
        {#if buses.length === 0}
            <div class="empty">none</div>
        {:else}
            <div class="strips">
                {#each buses as bus (bus)}
                    <MixerChannel label={bus.name} audioContext={nllc.audioContext} channel={bus} onRemove={(b) => nllc.removeBus(b)} {onInsert} />
                {/each}
            </div>
        {/if}
    </div>

    <div class="master-strip">
        <div class="title">Master</div>
        <MixerChannel label={nllc.master.name} audioContext={nllc.audioContext} channel={nllc.master} {onInsert} />
    </div>

    <div class="modulator-section">
        <div class="title">Modulators</div>
        {#if modulators.length === 0}
            <div class="empty">none</div>
        {:else}
            <div class="modulator-rail">
                {#each modulators as modulator (modulator)}
                    <ModulatorStrip {modulator} audioContext={nllc.audioContext} onRemove={(m) => nllc.removeModulator(m)} {onInsert} />
                {/each}
            </div>
        {/if}
    </div>

    <PatchList {patches} onRemove={(p) => nllc.removePatch(p)} />
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

    .title {
        color: var(--nllc-text-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.65rem;
        font-family: var(--nllc-font-mono);
        margin-bottom: 0.4rem;
    }

    .empty {
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 0.75rem;
    }

    .tracks-section {
        display: flex;
        flex-direction: column;
        flex: 1;
    }

    .buses-section {
        display: flex;
        flex-direction: column;
        border-left: 1px solid var(--nllc-border);
        padding-left: 1rem;
    }

    .strips {
        display: flex;
        gap: 0.5rem;
    }

    .master-strip {
        border-left: 1px solid var(--nllc-border);
        padding-left: 1rem;
    }

    .modulator-section {
        width: 100%;
        padding-top: 0.75rem;
        border-top: 1px solid var(--nllc-border);
    }

    .modulator-rail {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
</style>
