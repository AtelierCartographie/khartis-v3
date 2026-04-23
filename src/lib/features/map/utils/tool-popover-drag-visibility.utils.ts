export const DRAGGING_STYLING_TARGET_BODY_CLASS = 'is-dragging-styling-target';

export function setStylingToolPopoverDragging(active: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.classList.toggle(DRAGGING_STYLING_TARGET_BODY_CLASS, active);
}
