<script>
    import { onMount } from "svelte";

    // Audio prefs are stored here (localStorage) and picked up by
    // SessionPage.svelte on mount when it constructs its own Ribbit/
    // AudioContext — this page never creates one itself, so there's nothing
    // here to apply them *to* yet, just to remember for next time.
    const LATENCY_KEY = "nllc:audioLatencyHint";
    const DEVICE_KEY = "nllc:audioOutputDeviceId";

    let latencyHint = $state("interactive");
    let outputDeviceId = $state("");
    let outputDevices = $state([]);
    let devicesSupported = $state(false);
    let sinkIdSupported = $state(false);
    let labelsRevealed = $state(false);
    let deviceError = $state("");

    async function refreshDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        outputDevices = devices.filter((d) => d.kind === "audiooutput");
        labelsRevealed = outputDevices.some((d) => d.label);
    };

    async function revealDeviceNames() {
        deviceError = "";
        try {
            // Most browsers only expose audiooutput labels once some media
            // permission has been granted — requesting the mic is the
            // standard workaround, even though this app never uses input
            // audio itself. Stop the track immediately; only the
            // permission grant (not the stream) is what's wanted.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            await refreshDevices();
        } catch (error) {
            deviceError = "Couldn't get device names (permission denied) — device IDs still work below, just unlabeled.";
        }
    };

    function setLatencyHint(value) {
        latencyHint = value;
        localStorage.setItem(LATENCY_KEY, value);
    };

    function setOutputDevice(value) {
        outputDeviceId = value;
        localStorage.setItem(DEVICE_KEY, value);
    };

    onMount(() => {
        latencyHint = localStorage.getItem(LATENCY_KEY) || "interactive";
        outputDeviceId = localStorage.getItem(DEVICE_KEY) || "";

        sinkIdSupported = typeof AudioContext !== "undefined" && typeof AudioContext.prototype.setSinkId === "function";
        devicesSupported = !!navigator.mediaDevices?.enumerateDevices;
        if (devicesSupported) refreshDevices();
    });
</script>

<svelte:head>
    <title>NLLC</title>
</svelte:head>

<div class="home">
    <header>
        <h1>NLLC</h1>
        <p class="tagline">A live-coding console for Web Audio.</p>
    </header>

    <div class="sessions">
        <a class="session-link" href="/code-editor">
            <span class="session-title">Blank session</span>
            <span class="session-desc">Start from nothing — just the master channel.</span>
        </a>
        <a class="session-link" href="/code-editor/demo">
            <span class="session-title">Demo session</span>
            <span class="session-desc">Auto-loads static/sessions/demo.json — two tracks, a reverb bus, an LFO patch, two saved states.</span>
        </a>
    </div>

    <section class="audio-options">
        <h2>Audio options</h2>
        <p class="hint">Applied the next time a session page starts its audio engine.</p>

        <label class="field">
            <span>Latency</span>
            <select value={latencyHint} onchange={(e) => setLatencyHint(e.target.value)}>
                <option value="interactive">Interactive (lowest latency)</option>
                <option value="balanced">Balanced</option>
                <option value="playback">Playback (fewest glitches)</option>
            </select>
        </label>

        <label class="field">
            <span>Output device</span>
            {#if !devicesSupported}
                <span class="unsupported">Not supported in this browser.</span>
            {:else}
                <select value={outputDeviceId} onchange={(e) => setOutputDevice(e.target.value)} disabled={!sinkIdSupported}>
                    <option value="">System default</option>
                    {#each outputDevices as device, i (device.deviceId)}
                        <option value={device.deviceId}>{device.label || `Output device ${i + 1}`}</option>
                    {/each}
                </select>
            {/if}
        </label>

        {#if devicesSupported && !sinkIdSupported}
            <p class="unsupported">This browser can list output devices but can't switch to one (AudioContext.setSinkId
                unsupported) — selection above won't take effect.</p>
        {/if}

        {#if devicesSupported && !labelsRevealed}
            <button class="reveal" onclick={revealDeviceNames}>Show device names</button>
        {/if}

        {#if deviceError}
            <p class="unsupported">{deviceError}</p>
        {/if}
    </section>
</div>

<style>
    .home {
        max-width: 640px;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    h1 {
        margin: 0;
        font-family: var(--nllc-font-mono);
        letter-spacing: 0.05em;
    }

    .tagline {
        margin: 0.25rem 0 0;
        color: var(--nllc-text-dim);
    }

    .sessions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    .session-link {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 1rem;
        border: 1px solid var(--nllc-border);
        border-radius: 6px;
        background: var(--nllc-panel-bg);
        color: var(--nllc-text);
        text-decoration: none;
    }

    .session-link:hover {
        border-color: var(--nllc-accent);
    }

    .session-title {
        font-family: var(--nllc-font-mono);
        font-weight: bold;
        color: var(--nllc-accent);
    }

    .session-desc {
        font-size: 0.85rem;
        color: var(--nllc-text-dim);
    }

    .audio-options {
        border: 1px solid var(--nllc-border);
        border-radius: 6px;
        background: var(--nllc-panel-bg);
        padding: 1rem 1.25rem 1.25rem;
    }

    .audio-options h2 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
        font-family: var(--nllc-font-mono);
    }

    .hint {
        margin: 0 0 1rem;
        font-size: 0.8rem;
        color: var(--nllc-text-dim);
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-bottom: 0.9rem;
        font-size: 0.85rem;
    }

    .field select {
        background: var(--nllc-bg);
        color: var(--nllc-text);
        border: 1px solid var(--nllc-border);
        border-radius: 4px;
        padding: 0.4rem 0.5rem;
        font-family: var(--nllc-font-ui);
    }

    .field select:disabled {
        opacity: 0.5;
    }

    .unsupported {
        font-size: 0.78rem;
        color: var(--nllc-text-dim);
        margin: 0.2rem 0 0;
    }

    .reveal {
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        color: var(--nllc-text-dim);
        border-radius: 4px;
        padding: 0.4rem 0.7rem;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .reveal:hover {
        color: var(--nllc-text);
        border-color: var(--nllc-accent);
    }
</style>
