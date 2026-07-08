<script>
    // A single modulator's live readout: name, its own params (e.g. an lfo's
    // freq), and a bipolar meter showing its current raw output value
    // (-1..1) — same AnalyserNode-tap pattern MixerChannel uses for its level
    // meter, just reading the last sample instead of a peak, since a
    // modulator's output is a signed control signal rather than audio to
    // measure the loudness of.
    let { modulator, audioContext, onRemove = () => {} } = $props();

    let value = $state(0);
    let paramsKey = $state("");
    let paramEntries = $state([]);

    $effect(() => {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        modulator.output.connect(analyser);

        const data = new Float32Array(analyser.fftSize);
        let rafId;

        const tick = () => {
            if (audioContext.state === "running") {
                analyser.getFloatTimeDomainData(data);
                value = data[data.length - 1];
            } else {
                value = 0;
            }

            const key = Object.entries(modulator.params).map(([k, p]) => `${k}:${p.get().toFixed(3)}`).join(",");
            if (key !== paramsKey) {
                paramsKey = key;
                paramEntries = Object.entries(modulator.params).map(([k, p]) => ({ key: k, value: p.get() }));
            }

            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            // Removing this modulator (nllc.removeModulator) already did a
            // blanket disconnect() of its output, which silently takes this
            // analyser tap down with it — so by the time this cleanup runs
            // (next Svelte tick after the modulators array updates) the
            // specific connection below may already be gone, which throws.
            try { modulator.output.disconnect(analyser); } catch {}
        };
    });

    const markerPercent = $derived(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100);
</script>

<div class="modulator">
    <button class="remove" onclick={() => onRemove(modulator)} title="Remove {modulator.name}">×</button>
    <div class="name">{modulator.name}</div>
    <div class="meter">
        <div class="meter-track">
            <div class="meter-marker" style="left: {markerPercent}%"></div>
        </div>
        <div class="meter-labels">
            <span>-1</span><span>0</span><span>1</span>
        </div>
    </div>
    <div class="params">
        {#each paramEntries as p (p.key)}
            <div class="param">{p.key}={p.value.toFixed(2)}</div>
        {/each}
    </div>
</div>

<style>
    .modulator {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        width: 96px;
        padding: 0.5rem;
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        border-radius: 4px;
        flex-shrink: 0;
    }

    .remove {
        position: absolute;
        top: 2px;
        right: 4px;
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

    .name {
        font-size: 0.75rem;
        color: var(--nllc-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding-right: 1rem;
    }

    .meter-track {
        position: relative;
        height: 6px;
        background: var(--nllc-panel-bg);
        border: 1px solid var(--nllc-border);
        border-radius: 3px;
    }

    .meter-marker {
        position: absolute;
        top: -2px;
        width: 2px;
        height: 10px;
        background: var(--nllc-accent);
        transform: translateX(-1px);
    }

    .meter-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.6rem;
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
    }

    .params {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        font-family: var(--nllc-font-mono);
        font-size: 0.65rem;
        color: var(--nllc-text-dim);
    }
</style>
