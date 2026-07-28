// Shared setup for the mixer's pointer drags (pane divider, section resize
// handles, pan dials).
//
// Two separate things cause a drag to leave text highlighted behind it:
//
// 1. pointerdown on a non-interactive element starts a native text selection,
//    which then extends as the pointer moves. preventDefault() on the
//    pointerdown stops that from starting.
// 2. A selection that already existed elsewhere on the page (from an earlier
//    click-drag in the console, say) can still be extended by the drag, and
//    preventDefault on our own element does nothing about it. Suppressing
//    user-select document-wide for the duration is what actually covers this.
//
// Returns the cleanup to run on pointerup — callers pair it with their own
// listener teardown.
export function beginDrag(event) {
    event.preventDefault();
    document.body.classList.add("dragging");
    return () => document.body.classList.remove("dragging");
};
