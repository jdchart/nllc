<script>
    let { onCommand = () => {} } = $props();

    let log = $state([]);
    let input = $state("");
    let logEl;

    async function submit() {
        const text = input.trim();
        if (!text) return;

        log.push({ type: "input", text });
        input = "";
        queueScroll();

        const result = await onCommand(text);
        if (result) {
            log.push({ type: "output", text: result });
            queueScroll();
        }
    };

    function handleKeydown(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            submit();
        }
    };

    function queueScroll() {
        requestAnimationFrame(() => {
            if (logEl) logEl.scrollTop = logEl.scrollHeight;
        });
    };
</script>

<div class="console">
    <div class="log" bind:this={logEl}>
        {#each log as entry}
            <div class="line {entry.type}">{entry.text}</div>
        {/each}
    </div>
    <div class="input-row">
        <span class="prompt">&gt;</span>
        <input
            class="input"
            type="text"
            bind:value={input}
            onkeydown={handleKeydown}
            placeholder="type a command..."
            autocomplete="off"
            spellcheck="false"
        />
    </div>
</div>

<style>
    .console {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: var(--nllc-font-mono);
        font-size: 0.85rem;
    }

    .log {
        flex: 1;
        overflow-y: auto;
        padding: 0.75rem 1rem;
    }

    .line {
        white-space: pre-wrap;
        margin-bottom: 0.35rem;
    }

    .line.input::before {
        content: "> ";
        color: var(--nllc-accent);
    }

    .line.output {
        color: var(--nllc-text-dim);
    }

    .input-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-top: 1px solid var(--nllc-border);
    }

    .prompt {
        color: var(--nllc-accent);
    }

    .input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--nllc-text);
        font-family: inherit;
        font-size: inherit;
    }
</style>
