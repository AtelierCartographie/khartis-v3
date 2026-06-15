const EDGE_TOLERANCE = 1;

export function horizontalWheelScroll(node: HTMLElement) {
  function handleWheel(event: WheelEvent) {
    if (event.deltaY === 0 || event.shiftKey) {
      return;
    }

    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    if (maxScrollLeft <= 0) {
      return;
    }

    const atStart = node.scrollLeft <= 0;
    const atEnd = node.scrollLeft >= maxScrollLeft - EDGE_TOLERANCE;
    if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) {
      return;
    }

    node.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  node.addEventListener('wheel', handleWheel, { passive: false });

  return {
    destroy() {
      node.removeEventListener('wheel', handleWheel);
    }
  };
}
