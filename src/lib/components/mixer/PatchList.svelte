<script>
    // Every active patch cable as a compact list: source -> dest plus its
    // live depth. depth is a raw AudioParam (not Svelte state), so this polls
    // it every frame the same way MixerChannel/Transport poll their own live
    // values, diffing a joined key so unrelated re-renders don't fire when
    // nothing has actually changed. An event patch (dest=<track>.notes — see
    // NLLCEventPatch) has no depth at all; depth is null for those rows.
    let { patches = [], onRemove = () => {} } = $props();

    let rows = $state([]);
    let rowsKey = $state("");

    $effect(() => {
        let rafId;
        const tick = () => {
            const key = patches.map((p) => `${p.id}:${p.params.depth ? p.depth.value.toFixed(3) : "notes"}`).join(",");
            if (key !== rowsKey) {
                rowsKey = key;
                rows = patches.map((p) => ({
                    id: p.id,
                    sourceName: p.sourceName,
                    destName: p.destName,
                    depth: p.params.depth ? p.depth.value : null,
                }));
            }
            rafId = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(rafId);
    });
</script>

<div class="patch-list">
    <div class="title">Patches</div>
    {#if rows.length === 0}
        <div class="empty">none</div>
    {:else}
        <div class="rows">
            {#each rows as row (row.id)}
                <div class="row">
                    <span class="id">{row.id}</span>
                    <span class="cable">{row.sourceName} → {row.destName}</span>
                    <span class="depth">{row.depth === null ? "notes" : `depth ${row.depth.toFixed(2)}`}</span>
                    <button class="remove" onclick={() => onRemove(patches.find((p) => p.id === row.id))} title="Remove {row.id}">×</button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .patch-list {
        width: 100%;
        padding: 0.5rem 0;
        border-top: 1px solid var(--nllc-border);
        font-family: var(--nllc-font-mono);
        font-size: 0.75rem;
    }

    .title {
        color: var(--nllc-text-dim);
        margin-bottom: 0.4rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.65rem;
    }

    .empty {
        color: var(--nllc-text-dim);
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--nllc-text);
    }

    .id {
        color: var(--nllc-text-dim);
        min-width: 1.5rem;
    }

    .cable {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .depth {
        color: var(--nllc-text-dim);
    }

    .remove {
        background: none;
        border: none;
        color: var(--nllc-text-dim);
        cursor: pointer;
        font-size: 0.8rem;
        line-height: 1;
        padding: 0;
    }

    .remove:hover {
        color: var(--nllc-meter-hot);
    }
</style>
