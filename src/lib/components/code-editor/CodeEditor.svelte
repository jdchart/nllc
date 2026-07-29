<script>
    import { onMount } from "svelte";

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

    // The current ghost-text completion — { start, end, full } (the current
    // token's span in `input`, both absolute indices, and the complete
    // string it could complete to) or null — recomputed on every keystroke/
    // cursor move via updateSuggestion, never touched directly by the
    // template. `end` need not be input.length: a suggestion can complete a
    // token anywhere in the line, not just a trailing one.
    let suggestion = $state(null);
    // The three-part display the .ghost overlay paints, composited around
    // wherever the suggestion's token sits (not necessarily at the end of
    // `input`) — see the .ghost markup below and the .input's own
    // color:transparent, which together make this overlay (not the real
    // input's native glyphs) the only thing actually visible, so a
    // suggestion can visually push later-in-the-line text over instead of
    // only ever appending after it.
    const ghostParts = $derived.by(() => {
        if (!suggestion) return { before: input, added: "", after: "" };
        const typedOfToken = input.slice(suggestion.start, suggestion.end);
        return {
            before: input.slice(0, suggestion.start) + typedOfToken,
            added: suggestion.full.slice(typedOfToken.length),
            after: input.slice(suggestion.end),
        };
    });

    // Shared by submit() (the input box's own Enter handling) and the
    // exported runCommand (below — driven from outside the console, e.g. the
    // mixer's Transport save/load buttons), so a command triggered either
    // way logs identically and rides the same history.
    async function runText(text) {
        if (!text) return;

        if (history[history.length - 1] !== text) history.push(text);
        historyIndex = -1;
        historyDraft = "";

        log.push({ type: "input", text });
        queueScroll();

        const result = await onCommand(text);
        if (result) {
            log.push({ type: "output", text: result });
            queueScroll();
        }
    };

    async function submit() {
        const text = input.trim();
        if (!text) return;

        input = "";
        suggestion = null;
        await runText(text);
    };

    // Runs a command as if the user had typed and submitted it — the vehicle
    // for UI affordances outside the console itself (e.g. Transport.svelte's
    // Save/Load buttons) to trigger a command while still showing up in the
    // scrollback exactly like a typed one, rather than succeeding/failing
    // silently. Reached via SessionPage.svelte's bind:this={codeEditor}, the
    // same handle insertAtCursor already uses.
    export function runCommand(text) {
        return runText(text);
    };

    // Appends output the console didn't ask for. Two kinds arrive this way,
    // styled differently because they read differently:
    //   "deferred" — at=beat/at=cycle work reporting back. `/hats stop
    //     at=cycle` returns "hats will stop (next cycle)" straight away, then
    //     this lands "hats stopped" a bar later.
    //   "readme"   — a loaded session introducing itself (see session.js).
    // Wired to ribbit.onMessage in SessionPage.svelte. Anything unrecognized
    // falls back to "deferred" rather than being interpolated into the class
    // attribute as-is.
    export function appendOutput(text, kind = "deferred") {
        log.push({ type: kind === "readme" ? "readme" : "deferred", text });
        queueScroll();
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
        suggestion = onSuggest(target.value, target.selectionStart);
    };

    // Accepts the current suggestion into `input`, splicing it into the
    // token's own span (suggestion.start..end) rather than always appending
    // at the end — the token being completed isn't necessarily at the end of
    // the line (see suggestCompletion). `run: true` (Enter with a suggestion
    // showing) submits the completed command immediately instead of leaving
    // it in the input for further editing — see handleKeydown.
    function acceptSuggestion({ run } = {}) {
        if (!suggestion) return;

        const spacer = run || suggestion.full.endsWith("=") ? "" : " ";
        const cursor = suggestion.start + suggestion.full.length + spacer.length;
        input = input.slice(0, suggestion.start) + suggestion.full + spacer + input.slice(suggestion.end);
        suggestion = null;

        if (run) {
            submit();
        } else {
            requestAnimationFrame(() => {
                inputEl?.focus();
                inputEl?.setSelectionRange(cursor, cursor);
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

    // The console is what this page is *for*, so it takes the caret on load
    // and you can start typing immediately. onMount rather than the
    // `autofocus` attribute (which needs an a11y-rule suppression) or an
    // $effect (which wouldn't reliably re-run for `inputEl`, a plain
    // bind:this target rather than $state) — onMount is simply guaranteed to
    // run once, after the binding is assigned.
    onMount(() => {
        inputEl?.focus();
    });
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
            <div class="ghost" aria-hidden="true"><span class="ghost-typed">{ghostParts.before}</span><span class="ghost-suggestion">{ghostParts.added}</span><span class="ghost-typed">{ghostParts.after}</span></div>
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

    /* Deferred output (see appendOutput) — arrives with no command directly
       above it, so the leading "·" marks it as unprompted rather than the
       reply to whatever happens to precede it in the scrollback. */
    .line.deferred {
        color: var(--nllc-text-dim);
        opacity: 0.75;
    }

    .line.deferred::before {
        content: "· ";
        color: var(--nllc-accent);
    }

    /* A session's readme (see appendOutput) — full-brightness and rule-set
       off, since it's the first thing in an empty scrollback and is meant to
       be read rather than skimmed past like command output. */
    .line.readme {
        color: var(--nllc-text);
        border-left: 2px solid var(--nllc-accent);
        padding-left: 0.6rem;
        margin: 0.25rem 0 0.6rem;
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

    /* Ghost-text completion: .ghost sits on top of .input in the same box
       (same font/padding/border, both zeroed, so the two line up exactly —
       relies on the console's monospace font for pixel-accurate alignment)
       and is the only layer that actually paints any text — .input's own
       glyphs are made transparent (caret-color keeps the real caret visible)
       so a suggestion spliced into the *middle* of the line (not just
       appended after it — see suggestCompletion/acceptSuggestion) can push
       later already-typed text over in the overlay without a mismatched,
       un-shifted copy of that text showing through from .input underneath.
       Both .ghost-typed spans (before/after the suggestion) render in the
       normal text color; only .ghost-suggestion (the inserted remainder) is
       dimmed. */
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
        color: var(--nllc-text);
    }

    .ghost-suggestion {
        color: var(--nllc-text-dim);
    }

    /* Tag-qualified (not bare ".input") — a submitted command's own log line
       also carries the "input" class (entry.type, see the {#each log} markup
       above: class="line input"), which a bare ".input { color: transparent }"
       would match too, silently making every echoed command invisible in the
       scrollback. Scoping to the actual <input> element only is what this
       rule needs. */
    input.input {
        flex: 1;
        min-width: 0;
        position: relative;
        background: transparent;
        border: none;
        outline: none;
        padding: 0;
        margin: 0;
        color: transparent;
        caret-color: var(--nllc-text);
        font-family: inherit;
        font-size: inherit;
    }

    input.input::placeholder {
        color: var(--nllc-text-dim);
    }

    input.input::selection {
        background: var(--nllc-accent);
        color: transparent;
    }
</style>
