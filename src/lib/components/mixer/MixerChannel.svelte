<script>
    import { untrack } from "svelte";
    import { beginDrag } from "$lib/scripts/drag.js";

    // onRemove is only passed for tracks/buses (see Mixer.svelte) — master
    // can't be removed, so leaving it undefined there hides the button below
    // rather than wiring it to a no-op. `patches` (every active RibbitPatch,
    // same array Mixer.svelte already threads to PatchList) is only used to
    // detect whether this channel's own gain/pan is a live patch
    // destination — a patch connects straight into the raw AudioParam
    // (see patch.js), so there's no bookkeeping on the param itself to read;
    // cross-referencing destName is the only way to know.
    let { label, audioContext, channel, patches = [], onInsert = () => {}, onRemove } = $props();
    const node = $derived(channel.gainNode);
    const gainParam = $derived(channel.params.gain);
    const panParam = $derived(channel.params.pan);
    const gainPatched = $derived(patches.some((p) => p.destName === `${channel.name}.gain`));
    const panPatched = $derived(patches.some((p) => p.destName === `${channel.name}.pan`));

    // "position" is the fader's linear 0-1 position; channel.params.gain's own
    // decode/encode (the same RibbitParam/taper.js exponential curve the
    // console's gain=/ramp path uses — see param.js/channel.js) turns it into
    // the node's actual 0-1 gain value, so the fader and the console share
    // exactly one taper implementation instead of two.
    let position = $state(untrack(() => gainParam.get()));
    let level = $state(0);
    let dragging = false;

    let pan = $state(untrack(() => panParam.get()));
    let panDragging = false;

    let processorIds = $state("");
    let processorList = $state([]);

    let sendsKey = $state("");
    let sendList = $state([]);

    // Single rAF loop drives the level meter, keeps the fader/pan reflecting
    // external changes (console commands, automation), and polls this
    // channel's processor list for additions/removals/bypass toggles — all
    // three read off the live channel object rather than Svelte state, since
    // Ribbit/RibbitChannel mutate their own arrays and AudioParams directly.
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
            if (!dragging) position = gainParam.get();
            if (!panDragging) pan = panParam.get();

            const currentIds = channel.processors.map((p) => `${p.id}:${p.active}`).join(",");
            if (currentIds !== processorIds) {
                processorIds = currentIds;
                processorList = channel.processors.map((p) => ({ id: p.id, name: p.name, active: p.active }));
            }

            // Same poll-and-diff as the processor list above — a send's own
            // gain is included in the key so a console send_gain= ramp
            // updates the badge live, not just add/remove.
            const currentSends = channel.sends.map((s) => `${s.id}:${s.destName}:${s.params.gain.get().toFixed(2)}`).join(",");
            if (currentSends !== sendsKey) {
                sendsKey = currentSends;
                sendList = channel.sends.map((s) => ({ id: s.id, destName: s.destName, gain: s.params.gain.get() }));
            }

            rafId = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            // Removing this track (nllc.removeTrack) already did a blanket
            // disconnect() of gainNode, which silently takes this analyser
            // tap down with it — so by the time this cleanup runs (next
            // Svelte tick after the tracks array updates) the specific
            // connection below may already be gone, which throws.
            try { node.disconnect(analyser); } catch {}
        };
    });

    function handleInput(event) {
        position = Number(event.target.value);
        gainParam.audioParam.cancelScheduledValues(audioContext.currentTime);
        gainParam.audioParam.setTargetAtTime(gainParam.encode(position), audioContext.currentTime, 0.01);
    };

    function setPan(value) {
        pan = panParam.clamp(value);
        panParam.audioParam.cancelScheduledValues(audioContext.currentTime);
        panParam.audioParam.setTargetAtTime(panParam.encode(pan), audioContext.currentTime, 0.01);
    };

    // Rotary dial: drag vertically to change value, like a mixing-console knob
    // (dragging in a circle around a small knob is fiddly with a mouse).
    let panStartY = 0;
    let panStartValue = 0;

    function handlePanPointerMove(event) {
        setPan(panStartValue + (panStartY - event.clientY) / 100);
    };

    let endPanDrag = () => {};

    function handlePanPointerUp() {
        panDragging = false;
        endPanDrag();
        window.removeEventListener("pointermove", handlePanPointerMove);
        window.removeEventListener("pointerup", handlePanPointerUp);
    };

    function handlePanPointerDown(event) {
        endPanDrag = beginDrag(event);
        // beginDrag's preventDefault also suppresses the click's default
        // focus, and this is a tabindex=0 role="slider" — focus it back so
        // clicking it still leaves it as the focused control.
        event.currentTarget.focus();
        panDragging = true;
        panStartY = event.clientY;
        panStartValue = pan;
        window.addEventListener("pointermove", handlePanPointerMove);
        window.addEventListener("pointerup", handlePanPointerUp);
    };

    // Bypass-toggling an insert is the common case and stays a plain click;
    // shift+click instead pastes its id into the console (e.g. to target it
    // directly, /p1 wet=0.5), matching the modifier-click convention used
    // nowhere else yet in this app but familiar from most editors/DAWs.
    function handleInsertClick(event, proc) {
        if (event.shiftKey) onInsert(proc.id);
        else channel.setProcessorActive(proc.id, !proc.active);
    };

    const meterHeight = $derived(Math.min(1, level) * 100);
    const meterColor = $derived(
        level > 0.85 ? "var(--nllc-meter-hot)" : level > 0.6 ? "var(--nllc-meter-mid)" : "var(--nllc-meter-low)"
    );
    const panAngle = $derived(pan * 135);
</script>

<div class="channel">
    {#if onRemove}
        <button class="remove" onclick={() => onRemove(channel)} title="Remove {label}">×</button>
    {/if}
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
    <button class="param-label" title="click to insert &quot;gain=&quot; into the console" onclick={() => onInsert("gain=")}>
        gain{#if gainPatched}<span class="mod-dot" title="gain is being modulated by a patch"></span>{/if}
    </button>

    <div class="pan-dial" role="slider" tabindex="0" onpointerdown={handlePanPointerDown} aria-label="Pan" aria-valuemin="-1" aria-valuemax="1" aria-valuenow={pan}>
        <div class="pan-dial-indicator" style="transform: rotate({panAngle}deg)"></div>
    </div>
    <button class="param-label" title="click to insert &quot;pan=&quot; into the console" onclick={() => onInsert("pan=")}>
        pan{#if panPatched}<span class="mod-dot" title="pan is being modulated by a patch"></span>{/if}
    </button>

    <div class="inserts">
        {#each processorList as proc (proc.id)}
            <button
                class="insert"
                class:inactive={!proc.active}
                title="{proc.id} — click to {proc.active ? 'bypass' : 'enable'}, shift+click to insert into console"
                onclick={(event) => handleInsertClick(event, proc)}
            >{proc.name}</button>
        {/each}
    </div>

    <!-- Where this channel's post-fader signal goes — read-only plus
         click-to-paste, same scope as modulator/patch rows: adjusting a
         send stays a console action, the badge just tees the command up. -->
    <div class="sends-list">
        {#each sendList as send (send.id)}
            <button
                class="send"
                title="{send.id} → {send.destName} (gain {send.gain.toFixed(2)}) — click to insert &quot;send={send.id} send_gain=&quot; into the console"
                onclick={() => onInsert(`send=${send.id} send_gain=`)}
            >→{send.destName} {send.gain.toFixed(2)}</button>
        {/each}
    </div>

    <button class="label" title="click to insert &quot;{label}&quot; into the console" onclick={() => onInsert(label)}>{label}</button>
    {#if channel.source}
        <button
            class="synth-label"
            title="{channel.source.llm_summary} — click to insert &quot;synth=&quot; into the console"
            onclick={() => onInsert("synth=")}
        >{channel.source.name}</button>
    {/if}
</div>

<style>
    .channel {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 64px;
        gap: 0.5rem;
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
        color: var(--nllc-accent);
        background: var(--nllc-bg);
        border: 1px solid var(--nllc-accent);
        border-radius: 2px;
        padding: 1px 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
    }

    .insert.inactive {
        color: var(--nllc-text-dim);
        border-color: var(--nllc-border);
        text-decoration: line-through;
    }

    .sends-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
    }

    .send {
        font-family: var(--nllc-font-mono);
        font-size: 0.55rem;
        text-align: center;
        color: var(--nllc-text-dim);
        background: none;
        border: none;
        border-radius: 2px;
        padding: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
    }

    .send:hover {
        color: var(--nllc-accent);
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
        font: inherit;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-size: 0.7rem;
        color: var(--nllc-text-dim);
        text-align: center;
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .label:hover {
        color: var(--nllc-accent);
    }

    .param-label {
        font: inherit;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-size: 0.6rem;
        color: var(--nllc-text-dim);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .param-label:hover {
        color: var(--nllc-accent);
    }

    /* A small pulsing dot beside "gain"/"pan" when a patch is actively
       modulating it — the numeric fader/dial position still only ever shows
       the base value (see MixerChannel.svelte's gainParam.get()/panParam.get()
       polling), since that's the one thing a patch's live-modulated
       AudioParam can't itself report back through a plain .value read. */
    .mod-dot {
        display: inline-block;
        width: 5px;
        height: 5px;
        margin-left: 3px;
        border-radius: 50%;
        background: var(--nllc-accent);
        animation: mod-pulse 1.2s ease-in-out infinite;
    }

    @keyframes mod-pulse {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 1; }
    }

    .synth-label {
        font: inherit;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-size: 0.6rem;
        color: var(--nllc-text-dim);
        text-align: center;
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .synth-label:hover {
        color: var(--nllc-accent);
    }
</style>
