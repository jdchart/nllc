<script>
    // A minimized stand-in for the full Mixer pane (shown when the user
    // collapses it): just the master power button, clock LED, and level
    // meter, so playback stays controllable/visible without the full strips.
    let { nllc } = $props();

    let level = $state(0);
    let running = $state(false);
    let beat = $state(0);

    $effect(() => {
        const analyser = nllc.audioContext.createAnalyser();
        analyser.fftSize = 256;
        // nllc.master.connect() is for one-time bus wiring (it disconnects
        // gainNode first); tap gainNode directly so the destination link survives.
        nllc.master.gainNode.connect(analyser);

        const data = new Float32Array(analyser.fftSize);
        let rafId;

        const tick = () => {
            running = nllc.running;

            if (running) {
                analyser.getFloatTimeDomainData(data);
                let peak = 0;
                for (let i = 0; i < data.length; i++) {
                    peak = Math.max(peak, Math.abs(data[i]));
                }
                level = peak;
                beat = (nllc.audioContext.currentTime - nllc.clock.startTime) / nllc.clock.secondsPerBeat;
            } else {
                level = 0;
            }

            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            // Same guard MixerChannel's tap has — a torn-down engine may
            // already have taken this connection with it.
            try { nllc.master.gainNode.disconnect(analyser); } catch {}
        };
    });

    function toggle() {
        if (running) {
            nllc.stop();
        } else {
            nllc.start();
        }
    };

    const meterHeight = $derived(Math.min(1, level) * 100);
    const meterColor = $derived(
        level > 0.85 ? "var(--nllc-meter-hot)" : level > 0.6 ? "var(--nllc-meter-mid)" : "var(--nllc-meter-low)"
    );

    const loopBeat = $derived(
        ((beat % nllc.clock.loopLengthBeats) + nllc.clock.loopLengthBeats) % nllc.clock.loopLengthBeats
    );
    const ledOpacity = $derived(running ? 1 - (loopBeat - Math.floor(loopBeat)) : 0.15);
</script>

<div class="rail">
    <button
        class="power"
        class:on={running}
        onclick={toggle}
        aria-pressed={running}
        aria-label={running ? "Stop engine" : "Start engine"}
    >
        <span class="power-dot"></span>
    </button>
    <div class="led" style="opacity: {ledOpacity}"></div>
    <div class="meter">
        <div class="meter-fill" style="height: {meterHeight}%; background: {meterColor};"></div>
    </div>
</div>

<style>
    .rail {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        padding: 1rem 0;
        gap: 0.75rem;
        background: var(--nllc-panel-bg);
    }

    .power {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        border-radius: 50%;
        cursor: pointer;
        flex-shrink: 0;
    }

    .power.on {
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

    .led {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--nllc-accent);
        transition: opacity 40ms linear;
        flex-shrink: 0;
    }

    .meter {
        width: 8px;
        flex: 1;
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
</style>
