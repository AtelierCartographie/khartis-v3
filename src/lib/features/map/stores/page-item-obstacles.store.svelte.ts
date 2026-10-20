/** A page item's box, in map-area pixels at page scale 1: [x0, y0, x1, y1]. */
export type PageItemBox = [number, number, number, number];

export type PageItemSource = 'legend' | 'geo-indications' | 'annotations';

function areBoxesEqual(left: PageItemBox[], right: PageItemBox[]): boolean {
  return (
    left.length === right.length &&
    left.every((box, index) =>
      box.every((value, corner) => value === right[index][corner])
    )
  );
}

/**
 * Boxes of the page items drawn over the map (legend, geo indications,
 * annotations), which automatic label placement keeps clear. Each overlay
 * reports its own items from their stored position and rendered size.
 * Ephemeral: recomputed on every render, never persisted.
 */
function createPageItemObstaclesStore() {
  let boxesBySource = $state.raw<Record<PageItemSource, PageItemBox[]>>({
    legend: [],
    'geo-indications': [],
    annotations: []
  });
  let version = $state(0);

  function setBoxes(source: PageItemSource, boxes: PageItemBox[]): void {
    if (areBoxesEqual(boxesBySource[source], boxes)) return;
    boxesBySource = { ...boxesBySource, [source]: boxes };
    version += 1;
  }

  return {
    get version(): number {
      return version;
    },
    get boxes(): PageItemBox[] {
      return Object.values(boxesBySource).flat();
    },
    setBoxes
  };
}

export const pageItemObstaclesStore = createPageItemObstaclesStore();
