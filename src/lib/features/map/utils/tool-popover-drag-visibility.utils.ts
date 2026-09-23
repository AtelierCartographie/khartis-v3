export const DRAGGING_STYLING_TARGET_BODY_CLASS = 'is-dragging-styling-target';
export const RECENT_DND_INTERACTION_ATTRIBUTE = 'data-khartis-recent-dnd-at';
export const RECENT_DND_INTERACTION_GRACE_MS = 500;

export function markRecentDndInteraction(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.setAttribute(
    RECENT_DND_INTERACTION_ATTRIBUTE,
    String(Date.now())
  );
}

export function hasRecentDndInteraction(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const lastInteractionAt = Number(
    document.body.getAttribute(RECENT_DND_INTERACTION_ATTRIBUTE) ?? '0'
  );

  return (
    Number.isFinite(lastInteractionAt) &&
    Date.now() - lastInteractionAt < RECENT_DND_INTERACTION_GRACE_MS
  );
}

let isDraggingStylingTarget = false;

export function setStylingToolPopoverDragging(active: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }

  // Releasing a drag fires a click the popover would otherwise read as an
  // outside click and close on, leaving one drag per tool opening.
  if (isDraggingStylingTarget && !active) {
    markRecentDndInteraction();
  }

  isDraggingStylingTarget = active;
  document.body.classList.toggle(DRAGGING_STYLING_TARGET_BODY_CLASS, active);
}
