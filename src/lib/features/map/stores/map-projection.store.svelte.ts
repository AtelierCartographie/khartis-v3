export type MapProjectionType = 'mercator' | 'globe';

const DEFAULT_MAP_PROJECTION: MapProjectionType = 'mercator';
const PROJECTION_MERCATOR: MapProjectionType = 'mercator';
const PROJECTION_GLOBE: MapProjectionType = 'globe';

function createMapProjectionStore() {
  const state = $state({
    projection: DEFAULT_MAP_PROJECTION as MapProjectionType
  });

  function setProjection(projection: MapProjectionType): void {
    state.projection = projection;
  }

  function toggle(): void {
    state.projection =
      state.projection === PROJECTION_MERCATOR
        ? PROJECTION_GLOBE
        : PROJECTION_MERCATOR;
  }

  function reset(): void {
    state.projection = DEFAULT_MAP_PROJECTION;
  }

  function restoreFromSerialized(projection: MapProjectionType): void {
    if (
      !projection ||
      (projection !== PROJECTION_MERCATOR && projection !== PROJECTION_GLOBE)
    ) {
      reset();
      return;
    }
    state.projection = projection;
  }

  return {
    get projection(): MapProjectionType {
      return state.projection;
    },
    get isGlobe(): boolean {
      return state.projection === PROJECTION_GLOBE;
    },
    setProjection,
    toggle,
    reset,
    restoreFromSerialized
  };
}

export const mapProjectionStore = createMapProjectionStore();
