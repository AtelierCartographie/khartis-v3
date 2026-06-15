type OverflowTitleValue = string | null | undefined;

function hasTextOverflow(node: HTMLElement): boolean {
  return (
    node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight
  );
}

export function overflowTitle(node: HTMLElement, value: OverflowTitleValue) {
  let title = value?.trim() ?? '';
  let frame: number | undefined;
  let resizeObserver: ResizeObserver | undefined;

  function applyTitle() {
    if (title && hasTextOverflow(node)) {
      node.setAttribute('title', title);
      return;
    }

    node.removeAttribute('title');
  }

  function scheduleApplyTitle() {
    if (typeof window === 'undefined') {
      return;
    }

    if (frame !== undefined) {
      window.cancelAnimationFrame(frame);
    }

    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      applyTitle();
    });
  }

  scheduleApplyTitle();

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleApplyTitle);
    resizeObserver.observe(node);
  }

  return {
    update(nextValue: OverflowTitleValue) {
      title = nextValue?.trim() ?? '';
      scheduleApplyTitle();
    },
    destroy() {
      if (frame !== undefined && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frame);
      }

      resizeObserver?.disconnect();
      node.removeAttribute('title');
    }
  };
}
