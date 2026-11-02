const AREA_CLASS = 'kh-scroll-area';
const TOP_CLASS = 'kh-scroll-area--top';
const BOTTOM_CLASS = 'kh-scroll-area--bottom';

/**
 * Shades the edges of a scroller where content is hidden. The scroller's
 * parent must be a `.kh-scroll-area` wrapper of the same size: the shades are
 * drawn on it (global.css), above the content and its sticky headers.
 */
export function scrollShadows(node: HTMLElement): { destroy(): void } {
  const area = node.parentElement;
  if (!area?.classList.contains(AREA_CLASS)) {
    return { destroy() {} };
  }

  function update(): void {
    const { scrollTop, scrollHeight, clientHeight } = node;
    area?.classList.toggle(TOP_CLASS, scrollTop > 0);
    area?.classList.toggle(
      BOTTOM_CLASS,
      scrollTop + clientHeight < scrollHeight - 1
    );
  }

  // The content height changes without the scroller resizing: watch its
  // children too, and the children added later. jsdom has no ResizeObserver.
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);

  function observeChildren(): void {
    if (!resizeObserver) return;
    resizeObserver.disconnect();
    resizeObserver.observe(node);
    for (const child of node.children) {
      resizeObserver.observe(child);
    }
  }

  const mutationObserver = new MutationObserver(() => {
    observeChildren();
    update();
  });

  observeChildren();
  mutationObserver.observe(node, { childList: true });
  node.addEventListener('scroll', update, { passive: true });
  update();

  return {
    destroy() {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      node.removeEventListener('scroll', update);
      area.classList.remove(TOP_CLASS, BOTTOM_CLASS);
    }
  };
}
