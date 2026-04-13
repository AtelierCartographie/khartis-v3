import { EVENT, CUSTOM_EVENT } from '../constants/dom.constants';

export function clickOutside(
  node: HTMLElement,
  params?: { enabled?: boolean; excludeSelectors?: string[] }
) {
  let enabled = params?.enabled ?? true;
  let excludeSelectors = params?.excludeSelectors ?? [];

  function handleClick(event: MouseEvent) {
    if (!enabled) return;

    const target = event.target as Node;

    if (!node.contains(target)) {
      for (const selector of excludeSelectors) {
        const excludeElement = document.querySelector(selector);
        if (excludeElement && excludeElement.contains(target)) {
          return;
        }
      }

      node.dispatchEvent(
        new CustomEvent(CUSTOM_EVENT.OUTSIDE_CLICK, {
          detail: { originalEvent: event }
        })
      );
    }
  }

  function startListening() {
    setTimeout(() => {
      document.addEventListener(EVENT.CLICK, handleClick, true);
    }, 0);
  }

  function stopListening() {
    document.removeEventListener(EVENT.CLICK, handleClick, true);
  }

  if (enabled) {
    startListening();
  }

  return {
    update(newParams?: { enabled?: boolean; excludeSelectors?: string[] }) {
      enabled = newParams?.enabled ?? true;
      excludeSelectors = newParams?.excludeSelectors ?? [];

      if (enabled) {
        startListening();
      } else {
        stopListening();
      }
    },

    destroy() {
      stopListening();
    }
  };
}
