<script>
    // The full mixer pane: a transport strip, one MixerChannel per track, and
    // a master strip. Purely a read/write view onto the live Ribbit graph
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
    import MixerSection from "./MixerSection.svelte";

    let { nllc, tracks = [], buses = [], modulators = [], patches = [], onInsert = () => {}, onRunCommand = () => {} } = $props();
</script>

<div class="mixer">
    <Transport {nllc} {onRunCommand} />

    <!-- Tracks/Buses/Master sit side by side (Tracks grows to fill the row,
         Buses+Master keep their own natural/content size) so a wide Tracks
         section can never push Master onto a second row underneath
         everything — Tracks' own body scrolls its strips internally instead
         (see MixerSection). This row falls back to its own horizontal
         scroll if Buses+Master's combined minimum size still exceeds the
         pane at very narrow widths. -->
    <div class="row">
        <MixerSection title="Tracks" grow resizable maxWidth={1200}>
            {#if tracks.length === 0}
                <div class="empty">none</div>
            {:else}
                <div class="strips">
                    {#each tracks as track (track)}
                        <MixerChannel label={track.name} audioContext={nllc.audioContext} channel={track} {patches} onRemove={(t) => nllc.removeTrack(t)} {onInsert} />
                    {/each}
                </div>
            {/if}
        </MixerSection>

        <MixerSection title="Buses" resizable maxWidth={360}>
            {#if buses.length === 0}
                <div class="empty">none</div>
            {:else}
                <div class="strips">
                    {#each buses as bus (bus)}
                        <MixerChannel label={bus.name} audioContext={nllc.audioContext} channel={bus} {patches} onRemove={(b) => nllc.removeBus(b)} {onInsert} />
                    {/each}
                </div>
            {/if}
        </MixerSection>

        <!-- No hide or resize affordance at all — Master always stays
             visible at a fixed size regardless of what else is scrolled,
             collapsed, or resized. Wrapped with margin-left:auto so it
             always hugs the row's right edge instead of trailing wherever
             Tracks/Buses happen to end. -->
        <div class="master-slot">
            <MixerSection title="Master" collapsible={false}>
                <MixerChannel label={nllc.master.name} audioContext={nllc.audioContext} channel={nllc.master} {patches} {onInsert} />
            </MixerSection>
        </div>
    </div>

    <!-- Not resizable — a width-resize handle for a section that's already
         100% width has nowhere sensible to live (see MixerSection's "full"
         layout: it stacks below the content in a column, not beside it like
         the row sections, and reads as a stray control rather than a
         resize affordance). -->
    <MixerSection title="Modulators" layout="full">
        {#if modulators.length === 0}
            <div class="empty">none</div>
        {:else}
            <div class="strips">
                {#each modulators as modulator (modulator)}
                    <ModulatorStrip {modulator} audioContext={nllc.audioContext} onRemove={(m) => nllc.removeModulator(m)} {onInsert} />
                {/each}
            </div>
        {/if}
    </MixerSection>

    <PatchList {patches} onRemove={(p) => nllc.removePatch(p)} />
</div>

<style>
    .mixer {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nllc-panel-bg);
        padding: 1rem;
        gap: 0.75rem;
        min-height: 0;
        /* Without this the column takes its width from its widest child
           instead of from the pane, so a too-wide row pushes content out
           past the pane's clip edge rather than letting .row scroll it. */
        min-width: 0;
    }

    .row {
        display: flex;
        align-items: stretch;
        flex: 1;
        min-height: 0;
        overflow-x: auto;
        gap: 0.5rem;
    }

    .master-slot {
        display: flex;
        margin-left: auto;
    }

    .empty {
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 0.75rem;
    }

    .strips {
        display: flex;
        flex-wrap: nowrap;
        gap: 0.5rem;
        height: 100%;
    }
</style>
