<script>
    import { untrack } from "svelte";
    import { positionToGain, gainToPosition } from "$lib/scripts/nllc-src/taper";

    let { label, audioContext, channel } = $props();
    const node = $derived(channel.gainNode);

    // "position" is the fader's linear 0-1 position; it's exponentially
    // tapered onto the node's actual (also 0-1) gain for perceptually-even steps.
    let position = $state(untrack(() => gainToPosition(node.gain.value)));
    let level = $state(0);
    let dragging = false;

    let pan = $state(untrack(() => channel.pan.value));
    let panDragging = false;

    let processorIds = $state("");
    let processorList = $state([]);

    // Single rAF loop drives the level meter, keeps the fader/pan reflecting
    // external changes (console commands, automation), and polls this
    // channel's processor list for additions/removals/bypass toggles — all
    // three read off the live channel object rather than Svelte state, since
    // NLLC/NLLCChannel mutate their own arrays and AudioParams directly.
    $effect(() => {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        node.connect(analyser);

        const data = new Float32Array(analyser.fftSize);
        let rafId;

        const tick = () => {
            if (audioContext.state === "running") {
                analyser.getFloatTimeDomainData(data);
                let peak = 0;
                for (let i = 0; i < data.length; i++) {
                    peak = Math.max(peak, Math.abs(data[i]));
                }
                level = peak;
            } else {
                level = 0;
            }

            // Reflect gain/pan changes from console commands or automation,
            // but don't fight the user while they're actively dragging.
            if (!dragging) position = gainToPosition(node.gain.value);
            if (!panDragging) pan = channel.pan.value;

            const currentIds = channel.processors.map((p) => `${p.id}:${p.active}`).join(",");
            if (currentIds !== processorIds) {
                processorIds = currentIds;
                processorList = channel.processors.map((p) => ({ id: p.id, name: p.name, active: p.active }));
            }

            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            node.disconnect(analyser);
        };
    });

    function handleInput(event) {
        position = Number(event.target.value);
        node.gain.cancelScheduledValues(audioContext.currentTime);
        node.gain.setTargetAtTime(positionToGain(position), audioContext.currentTime, 0.01);
    };

    function setPan(value) {
        pan = Math.max(-1, Math.min(1, value));
        channel.pan.cancelScheduledValues(audioContext.currentTime);
        channel.pan.setTargetAtTime(pan, audioContext.currentTime, 0.01);
    };

    // Rotary dial: drag vertically to change value, like a mixing-console knob
    // (dragging in a circle around a small knob is fiddly with a mouse).
    let panStartY = 0;
    let panStartValue = 0;

    function handlePanPointerMove(event) {
        setPan(panStartValue + (panStartY - event.clientY) / 100);
    };

    function handlePanPointerUp() {
        panDragging = false;
        window.removeEventListener("pointermove", handlePanPointerMove);
        window.removeEventListener("pointerup", handlePanPointerUp);
    };

    function handlePanPointerDown(event) {
        panDragging = true;
        panStartY = event.clientY;
        panStartValue = pan;
        window.addEventListener("pointermove", handlePanPointerMove);
        window.addEventListener("pointerup", handlePanPointerUp);
    };

    const meterHeight = $derived(Math.min(1, level) * 100);
    const meterColor = $derived(
        level > 0.85 ? "var(--nllc-meter-hot)" : level > 0.6 ? "var(--nllc-meter-mid)" : "var(--nllc-meter-low)"
    );
    const panAngle = $derived(pan * 135);
</script>

<div class="channel">
    <div class="inserts">
        {#each processorList as proc (proc.id)}
            <button
                class="insert"
                class:inactive={!proc.active}
                title="{proc.id} — click to {proc.active ? 'bypass' : 'enable'}"
                onclick={() => channel.setProcessorActive(proc.id, !proc.active)}
            >{proc.name}</button>
        {/each}
    </div>

    <div class="meter-and-fader">
        <div class="meter">
            <div class="meter-fill" style="height: {meterHeight}%; background: {meterColor};"></div>
        </div>
        <input
            class="fader"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={position}
            oninput={handleInput}
            onpointerdown={() => dragging = true}
            onpointerup={() => dragging = false}
        />
    </div>

    <div class="pan-dial" role="slider" tabindex="0" onpointerdown={handlePanPointerDown} aria-label="Pan" aria-valuemin="-1" aria-valuemax="1" aria-valuenow={pan}>
        <div class="pan-dial-indicator" style="transform: rotate({panAngle}deg)"></div>
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

    .inserts {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        min-height: 1.2rem;
    }

    .insert {
        font-size: 0.6rem;
        font-family: inherit;
        text-align: center;
        color: var(--nllc-text-dim);
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        border-radius: 2px;
        padding: 1px 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
    }

    .insert.inactive {
        color: var(--nllc-border);
        text-decoration: line-through;
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

    .pan-dial {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        position: relative;
        cursor: ns-resize;
        flex-shrink: 0;
        touch-action: none;
    }

    .pan-dial-indicator {
        position: absolute;
        top: 3px;
        left: 50%;
        width: 2px;
        height: 10px;
        margin-left: -1px;
        background: var(--nllc-accent);
        transform-origin: 50% 11px;
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
