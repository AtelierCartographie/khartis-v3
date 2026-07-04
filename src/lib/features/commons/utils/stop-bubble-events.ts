import { EVENT } from '$lib/features/commons/constants/dom.constants';

const STOP_BUBBLE_EVENTS = [
  EVENT.CLICK,
  EVENT.MOUSEDOWN,
  EVENT.MOUSEUP,
  EVENT.POINTERDOWN,
  EVENT.POINTERUP,
  EVENT.KEYDOWN,
  EVENT.KEYUP
] as const;

interface StopBubbleEventsParams {
  capture?: boolean;
}

export function stopBubbleEvents(
  node: HTMLElement,
  params?: StopBubbleEventsParams
) {
  let capture = params?.capture ?? false;
  const handler = (event: Event) => event.stopPropagation();

  function addListeners(): void {
    STOP_BUBBLE_EVENTS.forEach((eventName) => {
      node.addEventListener(eventName, handler, { capture });
    });
  }

  function removeListeners(): void {
    STOP_BUBBLE_EVENTS.forEach((eventName) => {
      node.removeEventListener(eventName, handler, { capture });
    });
  }

  addListeners();

  return {
    update(newParams?: StopBubbleEventsParams) {
      const nextCapture = newParams?.capture ?? false;
      if (nextCapture === capture) {
        return;
      }

      removeListeners();
      capture = nextCapture;
      addListeners();
    },

    destroy() {
      removeListeners();
    }
  };
}
