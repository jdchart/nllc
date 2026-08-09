<script>
    // Transport-strip controls for the engine's recorder (ribbit/src/recorder.js):
    // arm/stop, the stereo/multitrack layout toggle, and save/discard for the
    // finished take.
    //
    // Every button runs the real console command rather than calling
    // nllc.recorder directly — the same choice Transport's Save/Load JSON
    // buttons make, and it earns more here: /record is the one command that
    // can take a moment (it compiles an AudioWorklet on first use) and whose
    // result the user genuinely needs to read ("saved ribbit-….zip — 7 files,
    // 48.2s"). Going through the console puts that in the scrollback.
    let { nllc, onRunCommand = () => {} } = $props();

    let recording = $state(false);
    let mode = $state("stereo");
    let hasTake = $state(false);
    let seconds = $state(0);
    let channels = $state(0);

    // Same polling shape as Transport's clock readout, and for the same
    // reason: the recorder is a plain object mutated by engine code, not
    // Svelte state, so nothing here would ever re-render on its own.
    $effect(() => {
        let rafId;

        const tick = () => {
            const recorder = nllc.recorder;
            recording = recorder.recording;
            mode = recorder.mode;
            hasTake = recorder.hasTake;
            seconds = recorder.durationSeconds;
            channels = recorder.take?.taps.length ?? 0;
            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => cancelAnimationFrame(rafId);
    });

    // m:ss.d — a take is minutes long at most (max_minutes caps it), so hours
    // never need a field, and the tenth is what makes the readout visibly
    // move while recording.
    function clock(value) {
        const minutes = Math.floor(value / 60);
        const rest = value - minutes * 60;
        return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
    };

    function toggleRecord() {
        onRunCommand(recording ? "/stop_record" : "/record");
    };

    // Refused rather than silently queued while a take is in progress: the
    // layout decides how many files a take has, so it can't change halfway
    // through one (the engine's setMode throws for the same reason).
    function setMode(next) {
        if (recording || next === mode) return;
        onRunCommand(`/recording mode=${next}`);
    };
</script>

<div class="recorder">
    <button
        class="rec"
        class:on={recording}
        onclick={toggleRecord}
        aria-pressed={recording}
        title={recording ? "Stop recording" : "Start recording the session's output"}
    >
        <span class="rec-dot"></span>
        REC
    </button>

    <!-- One readout, two meanings: what's being captured right now, or what
         the finished take holds. Kept in one slot so the strip doesn't change
         width when a recording stops. -->
    <span class="readout" class:live={recording} class:idle={!recording && !hasTake}>
        {#if recording}
            {clock(seconds)} · {channels}ch
        {:else if hasTake}
            {clock(seconds)} take
        {:else}
            --:--
        {/if}
    </span>

    <div class="modes" role="group" aria-label="Recording layout">
        <button
            class="mode"
            class:on={mode === "stereo"}
            disabled={recording}
            onclick={() => setMode("stereo")}
            title="Record master only, as one stereo .wav"
        >ST</button>
        <button
            class="mode"
            class:on={mode === "multitrack"}
            disabled={recording}
            onclick={() => setMode("multitrack")}
            title="Record every track, bus and master as its own .wav, downloaded as a .zip"
        >MT</button>
    </div>

    <button
        class="io-button"
        disabled={!hasTake}
        onclick={() => onRunCommand("/save_record")}
        title="Download the take"
    >Save</button>
    <button
        class="io-button discard"
        disabled={!hasTake && !recording}
        onclick={() => onRunCommand("/clear_record")}
        title="Discard the take and free the memory it holds"
        aria-label="Discard recording"
    >×</button>
</div>

<style>
    .recorder {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .rec {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 0.7rem;
        letter-spacing: 0.05em;
        padding: 0.35rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
    }

    .rec:hover {
        color: var(--nllc-text);
    }

    .rec.on {
        color: var(--nllc-text);
        border-color: var(--nllc-meter-hot);
    }

    .rec-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--nllc-border);
    }

    /* Blinking, not merely lit: a record light that is only a colour is easy
       to leave running for ten minutes without noticing. */
    .rec.on .rec-dot {
        background: var(--nllc-meter-hot);
        animation: blink 1s steps(1, end) infinite;
    }

    @keyframes blink {
        50% { opacity: 0.15; }
    }

    @media (prefers-reduced-motion: reduce) {
        .rec.on .rec-dot { animation: none; }
    }

    .readout {
        font-family: var(--nllc-font-mono);
        font-size: 0.7rem;
        color: var(--nllc-text);
        /* Fixed width so the strip doesn't shuffle as the tenths tick over
           or the channel count appears. */
        min-width: 5.5rem;
        text-align: center;
    }

    .readout.live {
        color: var(--nllc-meter-hot);
    }

    .readout.idle {
        color: var(--nllc-text-dim);
    }

    .modes {
        display: flex;
    }

    .mode {
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 0.65rem;
        letter-spacing: 0.03em;
        padding: 0.35rem 0.45rem;
        cursor: pointer;
    }

    .mode:first-child {
        border-radius: 4px 0 0 4px;
    }

    .mode:last-child {
        border-radius: 0 4px 4px 0;
        border-left: none;
    }

    .mode.on {
        color: var(--nllc-text);
        border-color: var(--nllc-accent);
    }

    /* The unselected half keeps the selected one's accent edge between them,
       so the pair reads as one switch rather than two buttons. */
    .mode.on + .mode {
        border-left: 1px solid var(--nllc-accent);
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

    .io-button:hover:not(:disabled) {
        color: var(--nllc-accent);
        border-color: var(--nllc-accent);
    }

    .discard {
        padding: 0.35rem 0.5rem;
    }

    .discard:hover:not(:disabled) {
        color: var(--nllc-meter-hot);
        border-color: var(--nllc-meter-hot);
    }

    .mode:disabled,
    .io-button:disabled {
        opacity: 0.4;
        cursor: default;
    }
</style>
