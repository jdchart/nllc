<script>
    // onRunCommand runs a command exactly as if it were typed into the
    // console (see CodeEditor.svelte's exported runCommand, threaded down
    // through SessionPage.svelte/Mixer.svelte) — Save/Load below reuse the
    // real /save_json /load_json handlers rather than duplicating the
    // download/file-picker logic here.
    let { nllc, onRunCommand = () => {} } = $props();

    let running = $state(false);
    let beat = $state(0);
    let bpm = $state(0);
    let numBeats = $state(0);

    // nllc.running/nllc.clock aren't Svelte state (they're mutated by plain
    // Ribbit/RibbitClock methods, not component code), so this polls them every
    // frame and recomputes the current beat from the clock's own precise
    // AudioContext-time bookkeeping rather than tracking beats independently.
    // bpm/numBeats are polled into their own $state too (not read off
    // nllc.clock in the template) so a /clock change made while the engine
    // is stopped still updates the readout — with the beat frozen, nothing
    // else would trigger a re-render.
    $effect(() => {
        let rafId;

        const tick = () => {
            running = nllc.running;
            bpm = nllc.clock.bpm;
            numBeats = nllc.clock.loopLengthBeats;
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
        numBeats > 0 ? ((beat % numBeats) + numBeats) % numBeats : 0
    );
    const ledOpacity = $derived(running ? 1 - (loopBeat - Math.floor(loopBeat)) : 0.15);
    // Position within the current loop as 0-100%, drawn as a conic ring
    // around the LED — the LED keeps pulsing per beat, the ring sweeps once
    // per cycle, so both "where in the beat" and "where in the loop" read
    // at a glance.
    const loopProgress = $derived(running && numBeats > 0 ? (loopBeat / numBeats) * 100 : 0);
</script>

<div class="transport">
    <button class="power" class:on={running} onclick={toggle} aria-pressed={running}>
        <span class="power-dot"></span>
        {running ? "ON" : "OFF"}
    </button>

    <div class="clock">
        <div class="led-ring" style="background: conic-gradient(var(--nllc-accent) {loopProgress}%, var(--nllc-border) 0)">
            <div class="led" style="opacity: {ledOpacity}"></div>
        </div>
        <div class="readout">
            <span class="beat">{loopBeat.toFixed(1)} / {numBeats}</span>
            <!-- toFixed+unary-plus trims a mid-rampBpm value like
                 133.33333 to 133.3 without turning a plain 120 into 120.0 -->
            <span class="bpm">{+bpm.toFixed(1)} BPM</span>
        </div>
    </div>

    <div class="session-io">
        <button class="io-button" onclick={() => onRunCommand("/save_json")} title="Download the whole session as a .json file">Save JSON</button>
        <button class="io-button" onclick={() => onRunCommand("/load_json")} title="Pick a .json file and load it, replacing the current session">Load JSON</button>
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

    /* The ring is just a conic-gradient circle the LED sits inside — the
       gradient stop (loop progress) is driven inline from loopProgress. */
    .led-ring {
        position: relative;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    /* Solid disc between the gradient and the LED, so the ring reads as a
       2px annulus even while the LED's own opacity fades per beat. */
    .led-ring::before {
        content: "";
        position: absolute;
        inset: 2px;
        border-radius: 50%;
        background: var(--nllc-panel-bg);
    }

    .led {
        position: relative;
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

    .session-io {
        display: flex;
        gap: 0.5rem;
        margin-left: auto;
    }

    .io-button {
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 0.7rem;
        letter-spacing: 0.03em;
        padding: 0.35rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
    }

    .io-button:hover {
        color: var(--nllc-accent);
        border-color: var(--nllc-accent);
    }
</style>
