import { KEY } from '../constants/dom.constants';

/** Shift with an arrow moves a number field by this many steps. */
export const LARGE_STEP_MULTIPLIER = 10;

/**
 * Steps a focused `<input type="number">` by ten of its steps on Shift with
 * the up or down arrow. The browser clamps to min and max and aligns on the
 * step; the input and change events let the field's owner commit the value as
 * if it were typed. Returns whether the key was handled.
 */
export function stepNumberInputOnShiftArrow(event: KeyboardEvent): boolean {
  const { target } = event;
  if (
    !event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    (event.key !== KEY.ARROW_UP && event.key !== KEY.ARROW_DOWN) ||
    !(target instanceof HTMLInputElement) ||
    target.type !== 'number' ||
    target.disabled ||
    target.readOnly
  ) {
    return false;
  }

  // stepUp needs a numeric step and a starting value.
  if (target.step === 'any') return false;
  if (target.value === '') target.value = target.min || '0';

  if (event.key === KEY.ARROW_UP) {
    target.stepUp(LARGE_STEP_MULTIPLIER);
  } else {
    target.stepDown(LARGE_STEP_MULTIPLIER);
  }

  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
