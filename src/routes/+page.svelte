<script>
    import { onMount } from "svelte";

    // Every .json in static/sessions, listed server-side (+page.server.js) —
    // static assets can't be enumerated from the browser.
    let { data } = $props();

    // Defaults to the first session until something is picked, rather than
    // seeding $state from `data` (which would only ever read its initial
    // value). Same value={...}/onchange={...} shape as the audio selects below.
    let pickedSlug = $state(null);
    const selectedSlug = $derived(pickedSlug ?? data.sessions[0]?.slug ?? "");
    const selectedSession = $derived(data.sessions.find((s) => s.slug === selectedSlug));

    // Audio prefs are stored here (localStorage) and picked up by
    // SessionPage.svelte on mount when it constructs its own Ribbit/
    // AudioContext — this page never creates one itself, so there's nothing
    // here to apply them *to* yet, just to remember for next time.
    const LATENCY_KEY = "nllc:audioLatencyHint";
    const DEVICE_KEY = "nllc:audioOutputDeviceId";

    // Which model /llm talks to. Stored the same way as the audio prefs and
    // read per question by SessionPage's LlmSession, so a change here applies
    // to the next question rather than the next page load. The value is a
    // qualified id, "<provider>:<model>" — see $lib/server/llm/index.js.
    const LLM_KEY = "nllc:llmModel";

    let llmModel = $state("");
    let llmProviders = $state([]);
    let llmLoading = $state(true);
    let llmError = $state("");
    let llmWarning = $state("");

    function setLlmModel(value) {
        llmModel = value;
        localStorage.setItem(LLM_KEY, value);
    };

    // The list is a *server* route for the same reason the session list is:
    // neither a local daemon's model list nor a binary on PATH is reachable
    // from a browser. Each provider reports its own error, so Ollama being
    // stopped doesn't hide the Claude models (or vice versa).
    async function loadModels() {
        llmLoading = true;
        try {
            const response = await fetch("/api/llm/models");
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

            ({ providers: llmProviders } = await response.json());
            llmError = "";

            const available = llmProviders.flatMap((provider) => provider.models.map((model) => model.id));
            // Only auto-pick when nothing is chosen yet — a saved choice that
            // has gone missing is warned about rather than silently replaced,
            // since the usual cause is a daemon that's temporarily down and
            // quietly switching models under someone is worse than a message.
            if (!llmModel && available.length) setLlmModel(available[0]);
            llmWarning = llmModel && !available.includes(llmModel)
                ? `"${llmModel}" isn't available right now — /llm will fail until it's back, or pick another.`
                : "";
        } catch (error) {
            llmError = `Couldn't load the model list — ${error.message}`;
        } finally {
            llmLoading = false;
        }
    };

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

        llmModel = localStorage.getItem(LLM_KEY) || "";
        loadModels();
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
        <div class="session-link saved">
            <span class="session-title">Saved session</span>
            {#if data.sessions.length === 0}
                <span class="session-desc">Nothing in static/sessions yet — save one from a session page
                    with the Save JSON button (or <code>/save_session</code>) and drop it in there.</span>
            {:else}
                <select value={selectedSlug} onchange={(e) => pickedSlug = e.target.value} aria-label="Session to load">
                    {#each data.sessions as session (session.slug)}
                        <option value={session.slug}>{session.slug}</option>
                    {/each}
                </select>
                <span class="session-desc" class:invalid={selectedSession && !selectedSession.valid}>
                    {selectedSession?.summary ?? ""}
                </span>
                <a class="open" href="/code-editor/{selectedSlug}">Open →</a>
            {/if}
        </div>
    </div>

    <section class="audio-options">
        <h2>Language model</h2>
        <p class="hint">Answers <code>/llm your question</code> in the console. Local models come from Ollama;
            Claude runs through the <code>claude</code> CLI on your own subscription — no API key involved.</p>

        <label class="field">
            <span>Model</span>
            {#if llmLoading}
                <span class="unsupported">Looking for models…</span>
            {:else}
                <select value={llmModel} onchange={(e) => setLlmModel(e.target.value)} aria-label="Model for /llm">
                    <option value="">None — /llm disabled</option>
                    {#each llmProviders as provider (provider.provider)}
                        {#if provider.models.length}
                            <optgroup label={provider.label}>
                                {#each provider.models as model (model.id)}
                                    <option value={model.id}>{model.label}{model.detail ? ` · ${model.detail}` : ""}</option>
                                {/each}
                            </optgroup>
                        {/if}
                    {/each}
                </select>
            {/if}
        </label>

        <!-- A provider that isn't reachable says so rather than just being
             absent — "Ollama isn't running" is a fixable problem, an empty
             dropdown is a mystery. -->
        {#each llmProviders as provider (provider.provider)}
            {#if provider.error}
                <p class="unsupported">{provider.label}: {provider.error}</p>
            {/if}
        {/each}

        {#if llmWarning}<p class="unsupported">{llmWarning}</p>{/if}
        {#if llmError}<p class="unsupported">{llmError}</p>{/if}

        <button class="reveal" onclick={loadModels} disabled={llmLoading}>Refresh models</button>
    </section>

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

    a.session-link:hover {
        border-color: var(--nllc-accent);
    }

    /* Same card chrome as a session link, but it holds controls rather than
       being one big click target, so it doesn't get the hover highlight. */
    .session-link.saved {
        gap: 0.6rem;
    }

    .session-link.saved select {
        background: var(--nllc-bg);
        color: var(--nllc-text);
        border: 1px solid var(--nllc-border);
        border-radius: 4px;
        padding: 0.4rem 0.5rem;
        font-family: var(--nllc-font-mono);
        width: 100%;
    }

    .session-desc.invalid {
        color: var(--nllc-meter-hot);
    }

    .open {
        align-self: flex-start;
        margin-top: auto;
        color: var(--nllc-accent);
        font-family: var(--nllc-font-mono);
        font-size: 0.85rem;
        text-decoration: none;
    }

    .open:hover {
        text-decoration: underline;
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

    .reveal:disabled {
        opacity: 0.5;
        cursor: default;
    }

    /* Provider groups in the model dropdown. Native optgroup labels render
       as the platform's own italic grey, which is illegible on a dark panel
       in some browsers — pin both explicitly. */
    .field select optgroup {
        background: var(--nllc-bg);
        color: var(--nllc-text-dim);
    }

    .field select option {
        color: var(--nllc-text);
    }

    .hint code {
        font-family: var(--nllc-font-mono);
        color: var(--nllc-text);
    }
</style>
