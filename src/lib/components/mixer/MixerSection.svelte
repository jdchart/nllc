<script>
    import { untrack } from "svelte";

    // One panel of the mixing bay. Two layouts:
    // - "row" (Tracks/Buses/Master, side by side in Mixer.svelte's `.row`):
    //   a vertical label sits beside a horizontally-scrolling body.
    // - "full" (Modulators, its own full-width row below `.row`, matching
    //   the pre-existing layout): a horizontal label sits above a
    //   horizontally-scrolling body.
    // Collapsing hides the body only — the label (`.title`) is never
    // conditionally hidden, in either layout, so a collapsed section still
    // reads as "this is what's hidden here," not just a bare arrow.
    // `grow` (Tracks) makes the body flex:1 within the row instead of sizing
    // to its own content — the fix for the original bug, where Tracks
    // having too many strips to fit pushed Master onto a second row
    // underneath everything: now Tracks' own body scrolls internally
    // instead of forcing the row wider than the mixer pane. `resizable` adds
    // a drag handle to a "row" section (Tracks/Buses/Master), `grow` or not;
    // before the first drag the body sizes itself the normal way for its
    // kind (flex:1 if `grow`, else its own content capped at `maxWidth`) —
    // dragging just locks in whatever pixel width was showing at that moment
    // (measured off the live DOM, not recomputed from scratch) as the new
    // fixed width going forward, at which point `grow` stops applying (an
    // explicit width and flex:1 would otherwise fight). Not meant for
    // `layout === "full"` (Modulators) — it's already 100% width, and a
    // handle stacked below the content in a column layout (rather than
    // beside it, like the row sections get) reads as a stray control rather
    // than a resize affordance, so Mixer.svelte doesn't enable it there.
    let {
        title,
        layout = "row",
        collapsible = true,
        resizable = false,
        grow = false,
        maxWidth = 360,
        minWidth = 100,
        children,
    } = $props();

    let collapsed = $state(false);
    let width = $state(null); // null = natural/content-sized, capped at maxWidth
    let resizing = $state(false);
    let bodyEl = $state();

    function startResize(event) {
        event.preventDefault();
        if (width === null) width = untrack(() => bodyEl.getBoundingClientRect().width);
        const startX = event.clientX;
        const startWidth = width;
        resizing = true;

        function onMove(moveEvent) {
            width = Math.min(maxWidth, Math.max(minWidth, startWidth + (moveEvent.clientX - startX)));
        };

        function onUp() {
            resizing = false;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const bodyStyle = $derived(
        width !== null ? `width: ${width}px` : grow || layout === "full" ? "" : `max-width: ${maxWidth}px`
    );
    // Only apply flex:1 growth while not manually resized — an explicit
    // pixel width and flex-grow would otherwise fight (flex:1's flex-basis:0
    // ignores width entirely).
    const growing = $derived(grow && width === null);
</script>

<div class="section {layout}" class:collapsed class:grow={growing}>
    <div class="header">
        {#if collapsible}
            <button
                class="collapse-toggle"
                onclick={() => collapsed = !collapsed}
                aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
            >{collapsed ? "›" : "‹"}</button>
        {/if}
        <div class="title">{title}</div>
    </div>

    {#if !collapsed}
        <div class="body" class:resizing bind:this={bodyEl} style={bodyStyle}>
            {@render children?.()}
        </div>
        {#if resizable}
            <div class="resize-handle" role="separator" aria-orientation="vertical" onpointerdown={startResize}></div>
        {/if}
    {/if}
</div>

<style>
    .header {
        display: flex;
        gap: 0.4rem;
        flex-shrink: 0;
    }

    .collapse-toggle {
        border: 1px solid var(--nllc-border);
        background: var(--nllc-panel-bg);
        color: var(--nllc-text-dim);
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.75rem;
        line-height: 1;
        flex-shrink: 0;
    }

    .collapse-toggle:hover {
        color: var(--nllc-accent);
        border-color: var(--nllc-accent);
    }

    .title {
        color: var(--nllc-text-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.65rem;
        font-family: var(--nllc-font-mono);
        white-space: nowrap;
    }

    .body {
        overflow-x: auto;
        overflow-y: hidden;
        min-width: 0;
    }

    .body.resizing {
        user-select: none;
    }

    /* "row" layout: Tracks/Buses/Master, side by side — vertical label,
       body/handle beside it, section stretches to the row's full height. */
    .section.row {
        display: flex;
        align-items: stretch;
        height: 100%;
        flex-shrink: 0;
    }

    .section.row.grow:not(.collapsed) {
        flex: 1;
        min-width: 0;
    }

    .section.row .header {
        flex-direction: column;
        align-items: flex-start;
        padding-right: 0.5rem;
    }

    .section.row .title {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
    }

    .section.row.collapsed {
        border-right: 1px solid var(--nllc-border);
        padding-right: 0.5rem;
    }

    .section.row .body {
        height: 100%;
    }

    .section.row.grow .body {
        flex: 1;
    }

    .resize-handle {
        width: 6px;
        flex-shrink: 0;
        margin: 0 0.5rem;
        border-right: 1px solid var(--nllc-border);
        cursor: col-resize;
    }

    .resize-handle:hover {
        border-right-color: var(--nllc-accent);
    }

    /* "full" layout: Modulators, its own full-width row below — horizontal
       label above a full-width scrollable body. */
    .section.full {
        display: flex;
        flex-direction: column;
        width: 100%;
        padding-top: 0.75rem;
        border-top: 1px solid var(--nllc-border);
    }

    .section.full .header {
        flex-direction: row;
        align-items: center;
        margin-bottom: 0.4rem;
    }

    .section.full .body {
        width: 100%;
    }
</style>
