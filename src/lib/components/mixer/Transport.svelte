<script>
    let { nllc } = $props();

    let running = $state(false);
    let beat = $state(0);

    // nllc.running/nllc.clock aren't Svelte state (they're mutated by plain
    // NLLC/NLLCClock methods, not component code), so this polls them every
    // frame and recomputes the current beat from the clock's own precise
    // AudioContext-time bookkeeping rather than tracking beats independently.
    $effect(() => {
        let rafId;

        const tick = () => {
            running = nllc.running;
            if (running) {
                beat = (nllc.audioContext.currentTime - nllc.clock.startTime) / nllc.clock.secondsPerBeat;
            }
            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => cancelAnimationFrame(rafId);
    });

    function toggle() {
        if (running) {
            nllc.stop();
        } else {
            nllc.start();
        }
    };

    // Loop-relative beat position (double modulo to stay positive), and an LED
    // that fades out across each beat so it visibly pulses with the tempo.
    const loopBeat = $derived(
        ((beat % nllc.clock.loopLengthBeats) + nllc.clock.loopLengthBeats) % nllc.clock.loopLengthBeats
    );
    const ledOpacity = $derived(running ? 1 - (loopBeat - Math.floor(loopBeat)) : 0.15);
</script>

<div class="transport">
    <button class="power" class:on={running} onclick={toggle} aria-pressed={running}>
        <span class="power-dot"></span>
        {running ? "ON" : "OFF"}
    </button>

    <div class="clock">
        <div class="led" style="opacity: {ledOpacity}"></div>
        <div class="readout">
            <span class="beat">{loopBeat.toFixed(1)} / {nllc.clock.loopLengthBeats}</span>
            <span class="bpm">{nllc.clock.bpm} BPM</span>
        </div>
    </div>
</div>

<style>
    .transport {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding-bottom: 1rem;
        margin-bottom: 1rem;
        border-bottom: 1px solid var(--nllc-border);
        width: 100%;
    }

    .power {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 0.75rem;
        letter-spacing: 0.05em;
        padding: 0.4rem 0.7rem;
        border-radius: 4px;
        cursor: pointer;
    }

    .power.on {
        color: var(--nllc-text);
        border-color: var(--nllc-accent);
    }

    .power-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--nllc-meter-hot);
    }

    .power.on .power-dot {
        background: var(--nllc-accent);
    }

    .clock {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .led {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--nllc-accent);
        transition: opacity 40ms linear;
    }

    .readout {
        display: flex;
        flex-direction: column;
        font-family: var(--nllc-font-mono);
        font-size: 0.75rem;
        color: var(--nllc-text-dim);
        line-height: 1.3;
    }

    .beat {
        color: var(--nllc-text);
    }
</style>
