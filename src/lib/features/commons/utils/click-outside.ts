import { EVENT, CUSTOM_EVENT } from '../constants/dom.constants';

export function clickOutside(
  node: HTMLElement,
  params?: { enabled?: boolean; excludeSelectors?: string[] }
) {
  let enabled = params?.enabled ?? true;
  let excludeSelectors = params?.excludeSelectors ?? [];
  let listenerAttached = false;
  let listenerTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (listenerAttached || listenerTimer) return;

    listenerTimer = setTimeout(() => {
      listenerTimer = null;
      if (!enabled) return;
      document.addEventListener(EVENT.CLICK, handleClick, true);
      listenerAttached = true;
    }, 0);
  }

  function stopListening() {
    if (listenerTimer) {
      clearTimeout(listenerTimer);
      listenerTimer = null;
    }

    if (!listenerAttached) return;
    document.removeEventListener(EVENT.CLICK, handleClick, true);
    listenerAttached = false;
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
