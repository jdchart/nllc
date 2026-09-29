<script>
    // Copied from lilypad's toolbar/AudioPanel.svelte — keep the two in step
    // (only the theme variables differ).
    //
    // The audio setup in one dropdown: where sound goes (output device,
    // master's hardware channels, extra outputs), what comes in (live audio
    // inputs, MIDI), and how /record captures. Like the rest of the UI it
    // holds no engine state: it reads the engine on a short poll, and every
    // change runs as a console command, so it lands in the scrollback and
    // the console and panel can't disagree.
    //
    // Two things are the browser's, not the session's, and are remembered
    // here in localStorage (shared with nllc): the latency hint (only read
    // when the AudioContext is built, so it applies on reload) and the
    // output device to use when a session doesn't ask for one.
    import { requestMidi, unlockDeviceLabels } from "ribbit";

    let { engine, onRun = () => {} } = $props();

    const LATENCY_KEY = "nllc:audioLatencyHint";
    const DEVICE_KEY = "nllc:audioOutputDeviceId";

    let open = $state(false);
    let button = $state(null);
    // Fixed, not absolute: nllc's mixer pane clips its overflow, and a
    // dropdown cut off at the pane's edge is no dropdown. Anchored under the
    // button, kept inside the viewport.
    let place = $state("");
    let tick = $state(0);
    let outputDevices = $state([]);
    let inputDevices = $state([]);
    let midiInputs = $state([]);
    let midiError = $state("");
    let latencyHint = $state("interactive");

    const MAX_INPUT_CHANNELS = 8;

    // The engine is plain objects; re-read it a few times a second while
    // the panel is open (cheap — this is lists and strings, not meters).
    $effect(() => {
        if (!open) return;
        const id = setInterval(() => tick++, 250);
        return () => clearInterval(id);
    });

    async function refreshDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        let devices = await navigator.mediaDevices.enumerateDevices();
        // Names are hidden until the page has microphone permission, so ask
        // for it once when they're missing.
        if (devices.some((d) => d.kind.startsWith("audio")) && devices.every((d) => !d.label)) {
            await unlockDeviceLabels();
            devices = await navigator.mediaDevices.enumerateDevices();
        }
        outputDevices = devices.filter((d) => d.kind === "audiooutput");
        inputDevices = devices.filter((d) => d.kind === "audioinput");
    };

    async function refreshMidi() {
        try {
            const access = await requestMidi();
            midiInputs = [...access.inputs.values()].map((input) => input.name);
            midiError = "";
        } catch (error) {
            midiError = error.message;
        }
    };

    function toggle() {
        open = !open;
        if (open) {
            const rect = button.getBoundingClientRect();
            const width = Math.min(340, window.innerWidth - 32);
            const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
            place = `top: ${rect.bottom + 6}px; left: ${left}px; width: ${width}px; max-height: ${Math.max(200, window.innerHeight - rect.bottom - 22)}px`;
            try { latencyHint = localStorage.getItem(LATENCY_KEY) || "interactive"; } catch {}
            refreshDevices();
            refreshMidi();
        }
    };

    // ── Derived from the engine (re-read on every tick) ─────────────────
    const hardware = $derived((tick, engine.hardware));
    const channelCount = $derived((tick, hardware?.channelCount ?? 2));
    const outputs = $derived((tick, [...(engine.outputs ?? [])]));
    const audioInputs = $derived((tick, engine.tracks.filter((t) => t.source?.type === "audioin")));
    const midiObjects = $derived((tick, engine.modulators.filter((m) => m.type === "midiin" || m.type === "midicc")));
    const recorder = $derived((tick, engine.recorder));
    const recordable = $derived((tick, [
        "master",
        ...engine.tracks.map((t) => t.name),
        ...engine.buses.map((b) => b.name),
        ...(engine.outputs ?? []).map((o) => o.name),
    ]));

    // Hardware channel choices: every stereo pair the device has, then
    // every single channel — a pair is the usual case.
    function channelChoices(count) {
        const list = [];
        for (let n = 1; n + 1 <= count; n += 2) list.push(`${n},${n + 1}`);
        for (let n = 1; n <= count; n++) list.push(String(n));
        return list;
    };
    const outputChoices = $derived(channelChoices(channelCount));
    const inputChoices = channelChoices(MAX_INPUT_CHANNELS);

    // The first pair nothing is using yet, for "+ output".
    function nextFreePair() {
        const used = new Set([hardware.main.options.channels.get(), ...outputs.map((o) => o.options.channels.get())]);
        return outputChoices.find((c) => c.includes(",") && !used.has(c)) ?? "3,4";
    };

    const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

    function setOutputDevice(deviceId) {
        try { localStorage.setItem(DEVICE_KEY, deviceId === "default" ? "" : deviceId); } catch {}
        onRun(`/master device=${quote(deviceId)}`);
    };

    function setLatency(value) {
        latencyHint = value;
        try { localStorage.setItem(LATENCY_KEY, value); } catch {}
    };

    // The engine keeps the query the user gave; show it against the device
    // list by id, falling back to "default".
    const currentOutput = $derived((tick, outputDevices.find((d) => d.deviceId === hardware?.device)?.deviceId ?? "default"));

    function inputDeviceValue(track) {
        const wanted = track.source.device;
        return inputDevices.find((d) => d.deviceId === wanted)?.deviceId ?? "default";
    };

    function toggleSource(name, on) {
        const next = on ? [...recorder.sources.filter((n) => n !== name), name] : recorder.sources.filter((n) => n !== name);
        if (next.length) onRun(`/recording sources=${next.join(",")}`);
    };
</script>

<div class="audio">
    <button bind:this={button} class="open" class:on={open} onclick={toggle} aria-expanded={open} title="Audio setup: outputs, inputs, MIDI and recording">audio ▾</button>

    {#if open}
        <div class="panel" role="dialog" aria-label="Audio setup" style={place}>
            <section>
                <h3>Output</h3>
                <label class="row">
                    <span>device</span>
                    {#if hardware?.supportsDeviceChoice}
                        <select value={currentOutput} onchange={(e) => setOutputDevice(e.target.value)}>
                            {#each outputDevices as device (device.deviceId)}
                                <option value={device.deviceId}>{device.label || device.deviceId}</option>
                            {/each}
                        </select>
                    {:else}
                        <span class="dim">this browser can't choose (needs Chrome 110+)</span>
                    {/if}
                </label>
                <div class="note">{hardware?.describe()}</div>
                <label class="row">
                    <span>latency</span>
                    <select value={latencyHint} onchange={(e) => setLatency(e.target.value)}>
                        <option value="interactive">interactive (lowest)</option>
                        <option value="balanced">balanced</option>
                        <option value="playback">playback (fewest glitches)</option>
                    </select>
                </label>
                <div class="note">latency applies on reload</div>

                <div class="list">
                    <div class="item">
                        <span class="name">master</span>
                        <select value={hardware?.main.options.channels.get()} onchange={(e) => onRun(`/master channels=${e.target.value}`)} title="Hardware outputs master lands on">
                            {#each outputChoices as choice (choice)}<option value={choice}>out {choice.replace(",", "-")}</option>{/each}
                        </select>
                        <span></span>
                    </div>
                    {#each outputs as output (output)}
                        <div class="item" class:silent={output.silent}>
                            <span class="name" title={output.describeState()}>{output.name}</span>
                            <select value={output.options.channels.get()} onchange={(e) => onRun(`/${output.name} channels=${e.target.value}`)}>
                                {#each outputChoices as choice (choice)}<option value={choice}>out {choice.replace(",", "-")}</option>{/each}
                                {#if !outputChoices.includes(output.options.channels.get())}<option value={output.options.channels.get()}>out {output.options.channels.get()} (not on device)</option>{/if}
                            </select>
                            <button class="x" onclick={() => onRun(`/${output.name} remove_self`)} title="Remove this output">×</button>
                        </div>
                    {/each}
                </div>
                <button class="add" onclick={() => onRun(`/add_output name=out channels=${nextFreePair()}`)} title="Another destination on the interface — send tracks/buses to it with out= or add_send=">+ output</button>
            </section>

            <section>
                <h3>Inputs</h3>
                {#each audioInputs as track (track)}
                    <div class="input">
                        <div class="item">
                            <span class="name">{track.name}</span>
                            <select value={inputDeviceValue(track)} onchange={(e) => onRun(`/${track.name} device=${quote(e.target.value)}`)}>
                                <option value="default">default input</option>
                                {#each inputDevices.filter((d) => d.deviceId !== "default") as device (device.deviceId)}
                                    <option value={device.deviceId}>{device.label || device.deviceId}</option>
                                {/each}
                            </select>
                            <button class="x" onclick={() => onRun(`/${track.name} remove_self`)} title="Remove this input">×</button>
                        </div>
                        <div class="item">
                            <span class="dim">channels</span>
                            <select value={track.source.options.channels.get()} onchange={(e) => onRun(`/${track.name} channels=${e.target.value}`)}>
                                {#each inputChoices as choice (choice)}<option value={choice}>in {choice.replace(",", "-")}</option>{/each}
                            </select>
                            <button class="toggle" class:on={track.source.monitor} onclick={() => onRun(`/${track.name} monitor=${track.source.monitor ? "off" : "on"}`)} title="Hear this input (off: analyse or record it without hearing it)">mon</button>
                        </div>
                        <div class="note">{track.source.describeState()}</div>
                    </div>
                {/each}
                <button class="add" onclick={() => onRun("/add_track synth=audioin name=input")} title="A live input as a track (the browser asks for the microphone)">+ audio input</button>

                <div class="list">
                    {#each midiObjects as midi (midi)}
                        <div class="item">
                            <span class="name" title={midi.describeState()}>{midi.name}</span>
                            <select value={midi.options.device.get()} onchange={(e) => onRun(`/${midi.name} device=${quote(e.target.value)}`)}>
                                <option value="any">any MIDI input</option>
                                {#each midiInputs as name (name)}<option value={name}>{name}</option>{/each}
                                {#if midi.options.device.get() !== "any" && !midiInputs.includes(midi.options.device.get())}<option value={midi.options.device.get()}>{midi.options.device.get()}</option>{/if}
                            </select>
                            <select class="narrow" value={String(midi.options.channel.get())} onchange={(e) => onRun(`/${midi.name} channel=${e.target.value}`)} title="MIDI channel">
                                <option value="0">all</option>
                                {#each Array.from({ length: 16 }, (_, i) => String(i + 1)) as ch (ch)}<option value={ch}>ch {ch}</option>{/each}
                            </select>
                        </div>
                        {#if midi.type === "midicc"}
                            <div class="item">
                                <span class="dim">control</span>
                                <input class="num" type="text" value={midi.options.cc.get()} onchange={(e) => onRun(`/${midi.name} cc=${e.target.value.trim()}`)} title="0-127, or pitchbend" />
                                <span></span>
                            </div>
                        {/if}
                    {/each}
                </div>
                <div class="note">{midiError ? `MIDI: ${midiError}` : `MIDI: ${midiInputs.length ? midiInputs.join(", ") : "no devices"}`}</div>
                <div class="buttons">
                    <button class="add" onclick={() => onRun("/add_modulator type=midiin name=keys")} title="A keyboard: patch its notes into a track">+ midi keys</button>
                    <button class="add" onclick={() => onRun("/add_modulator type=midicc name=knob cc=1")} title="One knob/fader as a 0..1 signal">+ midi cc</button>
                </div>
            </section>

            <section>
                <h3>Record</h3>
                <label class="row">
                    <span>what</span>
                    <select value={recorder.mode} disabled={recorder.recording} onchange={(e) => onRun(`/recording mode=${e.target.value}`)}>
                        <option value="stereo">master (stereo .wav)</option>
                        <option value="multitrack">every track + bus + master (.zip)</option>
                        <option value="selected">selected sources</option>
                    </select>
                </label>
                {#if recorder.mode === "selected"}
                    <div class="sources">
                        {#each recordable as name (name)}
                            <label class="source">
                                <input type="checkbox" checked={recorder.sources.includes(name)} disabled={recorder.recording} onchange={(e) => toggleSource(name, e.target.checked)} />
                                {name}
                            </label>
                        {/each}
                    </div>
                {/if}
                <label class="row">
                    <span>format</span>
                    <select value={String(recorder.bits)} onchange={(e) => onRun(`/recording bits=${e.target.value}`)}>
                        <option value="32">32-bit float</option>
                        <option value="24">24-bit</option>
                        <option value="16">16-bit</option>
                    </select>
                </label>
                <label class="row">
                    <span>max minutes</span>
                    <input class="num" type="text" value={recorder.maxMinutes} onchange={(e) => onRun(`/recording max_minutes=${e.target.value.trim()}`)} />
                </label>
                <div class="note">{recorder.describe()}</div>
            </section>
        </div>
    {/if}
</div>

<style>
    .audio {
        position: relative;
    }

    button,
    select,
    .num {
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-border);
        color: var(--nllc-text-dim);
        font-family: var(--nllc-font-mono);
        font-size: 11px;
        padding: 3px 6px;
        border-radius: 4px;
    }

    button {
        cursor: pointer;
    }

    button:hover,
    .open.on {
        color: var(--nllc-accent);
        border-color: var(--nllc-accent);
    }

    select {
        min-width: 0;
        max-width: 100%;
    }

    .panel {
        position: fixed;
        z-index: 50;
        overflow-y: auto;
        background: var(--nllc-panel-bg);
        border: 1px solid var(--nllc-border);
        border-radius: 6px;
        box-shadow: 0 6px 24px rgb(0 0 0 / 0.45);
        padding: 8px 10px;
        font-family: var(--nllc-font-mono);
        font-size: 11px;
        color: var(--nllc-text);
    }

    section + section {
        border-top: 1px solid var(--nllc-border);
        margin-top: 8px;
        padding-top: 6px;
    }

    h3 {
        margin: 2px 0 6px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nllc-accent);
    }

    .row,
    .item {
        display: grid;
        grid-template-columns: 80px 1fr auto;
        align-items: center;
        gap: 6px;
        margin: 3px 0;
    }

    .row {
        grid-template-columns: 80px 1fr;
    }

    .row > span,
    .dim,
    .note {
        color: var(--nllc-text-dim);
    }

    .note {
        font-size: 10px;
        margin: 2px 0 4px;
        overflow-wrap: anywhere;
    }

    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .item.silent .name {
        color: var(--nllc-meter-hot);
    }

    .input {
        border-left: 2px solid var(--nllc-border);
        padding-left: 6px;
        margin-bottom: 6px;
    }

    .list {
        margin: 4px 0;
    }

    .buttons {
        display: flex;
        gap: 6px;
    }

    .add {
        margin-top: 2px;
    }

    .x {
        padding: 1px 6px;
    }

    .toggle.on {
        color: var(--nllc-text);
        border-color: var(--nllc-accent);
    }

    .narrow {
        width: 5.5em;
    }

    .num {
        width: 6em;
    }

    .sources {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 10px;
        margin: 2px 0 4px 86px;
    }

    .source {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--nllc-text-dim);
    }
</style>
