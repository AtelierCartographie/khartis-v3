const SETTLE_DELAY_MS = 250;

/**
 * Bumps once the map view has stopped moving, so automatic label placement
 * runs again for the new view instead of on every frame of a zoom.
 */
function createLabelPlacementViewStore() {
  let version = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRefresh(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      version += 1;
    }, SETTLE_DELAY_MS);
  }

  return {
    get version(): number {
      return version;
    },
    scheduleRefresh
  };
}

export const labelPlacementViewStore = createLabelPlacementViewStore();
