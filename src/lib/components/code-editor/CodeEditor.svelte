<script>
    // The console: a scrollback log plus a single-line input. Purely a view —
    // it has no idea what a command means, it just calls `onCommand(text)`
    // (createCommandRouter's executeCommand, wired up by the parent page) and
    // logs whatever string comes back. `onSuggest(text, cursorPos)`
    // (createCommandRouter's suggest) is the same kind of pass-through for
    // ghost-text completion — see updateSuggestion/acceptSuggestion below.
    let { onCommand = () => {}, onSuggest = () => null } = $props();

    let log = $state([]);
    let input = $state("");
    let logEl;
    let inputEl;

    // Submitted commands, oldest first, for ArrowUp/ArrowDown recall (like a
    // shell history) — see handleKeydown. historyIndex counts back from the
    // end (-1 = not currently browsing, showing whatever's actually typed);
    // historyDraft holds that in-progress text so browsing away from it and
    // back (ArrowDown past the oldest browsed entry) restores it rather than
    // losing it. ArrowUp/ArrowDown only drive history when the input is
    // empty, or already mid-browse (historyIndex !== -1, so stepping further
    // back/forward still works even though a recalled line isn't empty) —
    // otherwise they're reserved for suggestion navigation (not built yet,
    // see docs/llm/overview.md), so they simply do nothing.
    let history = $state([]);
    let historyIndex = -1;
    let historyDraft = "";

    // The current ghost-text completion — { start, full } (absolute index
    // the active token starts at, and the complete string it could complete
    // to) or null — recomputed on every keystroke/cursor move via
    // updateSuggestion, never touched directly by the template.
    let suggestion = $state(null);
    // The greyed-out remainder rendered after the caret — see the .ghost
    // markup below, which relies on a monospace font so its invisible
    // "already-typed" spacer lines up pixel-for-pixel with the real input.
    const ghostText = $derived(suggestion ? suggestion.full.slice(input.length - suggestion.start) : "");

    async function submit() {
        const text = input.trim();
        if (!text) return;

        if (history[history.length - 1] !== text) history.push(text);
        historyIndex = -1;
        historyDraft = "";

        log.push({ type: "input", text });
        input = "";
        suggestion = null;
        queueScroll();

        const result = await onCommand(text);
        if (result) {
            log.push({ type: "output", text: result });
            queueScroll();
        }
    };

    function recallHistory(direction) {
        if (history.length === 0) return;

        if (direction === -1) {
            // Older: start browsing from the current draft, then step back
            // through history one entry at a time.
            if (historyIndex === -1) historyDraft = input;
            if (historyIndex < history.length - 1) historyIndex += 1;
        } else {
            // Newer: step forward; past the newest entry, restore the draft.
            if (historyIndex === -1) return;
            historyIndex -= 1;
        }

        input = historyIndex === -1 ? historyDraft : history[history.length - 1 - historyIndex];
        suggestion = null;
    };

    // Recomputes `suggestion` off a DOM element's own current value/cursor,
    // not the `input` state var — called from event handlers that may fire
    // before Svelte's own bind:value listener has synced `input` to match,
    // so reading the event target directly avoids a one-keystroke-stale race.
    function updateSuggestion(target) {
        if (!target) { suggestion = null; return; }
        const text = target.value;
        const cursor = target.selectionStart;
        suggestion = cursor === text.length ? onSuggest(text, cursor) : null;
    };

    // Accepts the current suggestion into `input`. `run: true` (Enter with a
    // suggestion showing) submits the completed command immediately instead
    // of leaving it in the input for further editing — see handleKeydown.
    function acceptSuggestion({ run } = {}) {
        if (!suggestion) return;

        const typedLength = input.length - suggestion.start;
        const remainder = suggestion.full.slice(typedLength);
        const spacer = run || suggestion.full.endsWith("=") ? "" : " ";
        input = input + remainder + spacer;
        suggestion = null;

        if (run) {
            submit();
        } else {
            requestAnimationFrame(() => {
                inputEl?.focus();
                inputEl?.setSelectionRange(input.length, input.length);
            });
        }
    };

    function handleInput(event) {
        // A real (user-driven) input event always means "left history
        // browsing" — programmatic input= assignments elsewhere (recallHistory,
        // insertAtCursor, acceptSuggestion) don't dispatch a native "input"
        // event, so this only fires for genuine typing/paste/cut.
        if (historyIndex !== -1) { historyIndex = -1; historyDraft = ""; }
        updateSuggestion(event.target);
    };

    function handleKeydown(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            if (suggestion) acceptSuggestion({ run: true });
            else submit();
        } else if (event.key === "ArrowRight") {
            if (suggestion) {
                event.preventDefault();
                acceptSuggestion();
            }
        } else if (event.key === "ArrowUp") {
            if (input.length === 0 || historyIndex !== -1) {
                event.preventDefault();
                recallHistory(-1);
            }
        } else if (event.key === "ArrowDown") {
            if (input.length === 0 || historyIndex !== -1) {
                event.preventDefault();
                recallHistory(1);
            }
        }
    };

    // Inserts `text` at the input's current cursor position (or selection,
    // which it replaces), for the mixer's click-to-paste affordances (see
    // MixerChannel/ModulatorStrip's onInsert). A trailing "=" (e.g. "gain=")
    // gets no separator, since the next thing typed is meant to butt right up
    // against it; anything else gets a trailing space so consecutive clicks
    // (e.g. a track name, then a param label) don't run together.
    export function insertAtCursor(text) {
        const toInsert = text.endsWith("=") ? text : `${text} `;
        const start = inputEl?.selectionStart ?? input.length;
        const end = inputEl?.selectionEnd ?? input.length;
        input = input.slice(0, start) + toInsert + input.slice(end);
        suggestion = null;

        const cursor = start + toInsert.length;
        requestAnimationFrame(() => {
            inputEl?.focus();
            inputEl?.setSelectionRange(cursor, cursor);
        });
    };

    // Deferred to the next frame so it runs after Svelte has actually
    // rendered the newly-pushed log line (scrollHeight would be stale
    // otherwise).
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
        <div class="input-wrap">
            <div class="ghost" aria-hidden="true"><span class="ghost-typed">{input}</span><span class="ghost-suggestion">{ghostText}</span></div>
            <input
                class="input"
                type="text"
                bind:value={input}
                bind:this={inputEl}
                onkeydown={handleKeydown}
                oninput={handleInput}
                onkeyup={(event) => updateSuggestion(event.target)}
                onclick={(event) => updateSuggestion(event.target)}
                placeholder="type a command..."
                autocomplete="off"
                spellcheck="false"
            />
        </div>
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

    /* Ghost-text completion: .ghost sits behind .input in the same box
       (same font/padding/border, both zeroed, so the two line up exactly —
       relies on the console's monospace font for pixel-accurate alignment).
       .ghost-typed is invisible but still occupies width, so .ghost-suggestion
       (the only thing actually painted) starts exactly where the real
       input's own typed text ends. */
    .input-wrap {
        position: relative;
        flex: 1;
        min-width: 0;
        display: flex;
    }

    .ghost {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        white-space: pre;
        overflow: hidden;
        pointer-events: none;
        font-family: inherit;
        font-size: inherit;
        padding: 0;
        margin: 0;
    }

    .ghost-typed {
        visibility: hidden;
    }

    .ghost-suggestion {
        color: var(--nllc-text-dim);
    }

    .input {
        flex: 1;
        min-width: 0;
        position: relative;
        background: transparent;
        border: none;
        outline: none;
        padding: 0;
        margin: 0;
        color: var(--nllc-text);
        font-family: inherit;
        font-size: inherit;
    }
</style>
