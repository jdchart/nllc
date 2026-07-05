<script>
    import { untrack } from "svelte";

    let { label, audioContext, node, min = 0, max = 1.5 } = $props();

    let value = $state(untrack(() => node.gain.value));
    let level = $state(0);

    $effect(() => {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        node.connect(analyser);

        const data = new Float32Array(analyser.fftSize);
        let rafId;

        const tick = () => {
            analyser.getFloatTimeDomainData(data);
            let peak = 0;
            for (let i = 0; i < data.length; i++) {
                peak = Math.max(peak, Math.abs(data[i]));
            }
            level = peak;
            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            node.disconnect(analyser);
        };
    });

    function handleInput(event) {
        value = Number(event.target.value);
        node.gain.cancelScheduledValues(audioContext.currentTime);
        node.gain.setTargetAtTime(value, audioContext.currentTime, 0.01);
    };

    const meterHeight = $derived(Math.min(1, level) * 100);
    const meterColor = $derived(
        level > 0.85 ? "var(--nllc-meter-hot)" : level > 0.6 ? "var(--nllc-meter-mid)" : "var(--nllc-meter-low)"
    );
</script>

<div class="channel">
    <div class="meter-and-fader">
        <div class="meter">
            <div class="meter-fill" style="height: {meterHeight}%; background: {meterColor};"></div>
        </div>
        <input
            class="fader"
            type="range"
            {min}
            {max}
            step="0.01"
            value={value}
            oninput={handleInput}
        />
    </div>
    <div class="label">{label}</div>
</div>

<style>
    .channel {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 64px;
        gap: 0.5rem;
        padding: 0.5rem 0;
        flex-shrink: 0;
    }

    .meter-and-fader {
        display: flex;
        gap: 0.4rem;
        height: 160px;
    }

    .meter {
        width: 8px;
        height: 100%;
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        border-radius: 2px;
        display: flex;
        align-items: flex-end;
        overflow: hidden;
    }

    .meter-fill {
        width: 100%;
        transition: height 60ms linear;
    }

    .fader {
        writing-mode: vertical-lr;
        direction: rtl;
        width: 8px;
        height: 100%;
        accent-color: var(--nllc-accent);
    }

    .label {
        font-size: 0.7rem;
        color: var(--nllc-text-dim);
        text-align: center;
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
