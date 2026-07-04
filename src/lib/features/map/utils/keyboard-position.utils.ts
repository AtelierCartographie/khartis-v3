import { KEY } from '$lib/features/commons/constants/dom.constants';

export const KEYBOARD_MOVE_STEP_PX = 1;
export const KEYBOARD_MOVE_FAST_STEP_PX = 10;

export function getKeyboardMoveDelta(
  event: KeyboardEvent,
  step = KEYBOARD_MOVE_STEP_PX,
  fastStep = KEYBOARD_MOVE_FAST_STEP_PX
): { x: number; y: number } | null {
  const amount = event.shiftKey ? fastStep : step;

  switch (event.key) {
    case KEY.ARROW_LEFT:
      return { x: -amount, y: 0 };
    case KEY.ARROW_RIGHT:
      return { x: amount, y: 0 };
    case KEY.ARROW_UP:
      return { x: 0, y: -amount };
    case KEY.ARROW_DOWN:
      return { x: 0, y: amount };
    default:
      return null;
  }
}
