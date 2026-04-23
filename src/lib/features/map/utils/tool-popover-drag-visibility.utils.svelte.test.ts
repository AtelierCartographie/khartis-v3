import { afterEach, describe, expect, it } from 'vitest';
import {
  DRAGGING_STYLING_TARGET_BODY_CLASS,
  setStylingToolPopoverDragging
} from './tool-popover-drag-visibility.utils';

describe('tool popover drag visibility utils', () => {
  afterEach(() => {
    document.body.classList.remove(DRAGGING_STYLING_TARGET_BODY_CLASS);
  });

  it('toggles the shared drag class on the body', () => {
    setStylingToolPopoverDragging(true);
    expect(
      document.body.classList.contains(DRAGGING_STYLING_TARGET_BODY_CLASS)
    ).toBe(true);

    setStylingToolPopoverDragging(false);
    expect(
      document.body.classList.contains(DRAGGING_STYLING_TARGET_BODY_CLASS)
    ).toBe(false);
  });
});
