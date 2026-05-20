import {
  MAP_PROJECTION_TYPE,
  type MapProjectionTypeValue
} from '$lib/features/commons/constants';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core/persistence-registry';

export type MapProjectionType = MapProjectionTypeValue;

const DEFAULT_MAP_PROJECTION: MapProjectionType = MAP_PROJECTION_TYPE.MERCATOR;
const PROJECTION_MERCATOR: MapProjectionType = MAP_PROJECTION_TYPE.MERCATOR;
const PROJECTION_GLOBE: MapProjectionType = MAP_PROJECTION_TYPE.GLOBE;
type SetProjectionOptions = {
  explicit?: boolean;
};

function createMapProjectionStore() {
  const state = $state({
    projection: DEFAULT_MAP_PROJECTION as MapProjectionType,
    explicitGlobe: false,
    flipY: false
  });

  function setProjection(
    projection: MapProjectionType,
    options: SetProjectionOptions = {}
  ): void {
    state.projection = projection;
    state.explicitGlobe =
      projection === PROJECTION_GLOBE ? (options.explicit ?? false) : false;
    persistenceRegistry.notifyChange('mapProjection', SavePriority.IMMEDIATE);
  }

  function toggle(): void {
    setProjection(
      state.projection === PROJECTION_MERCATOR
        ? PROJECTION_GLOBE
        : PROJECTION_MERCATOR,
      { explicit: true }
    );
  }

  function reset(): void {
    state.projection = DEFAULT_MAP_PROJECTION;
    state.explicitGlobe = false;
    state.flipY = false;
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
    state.explicitGlobe = projection === PROJECTION_GLOBE;
    state.flipY = false;
  }

  return {
    get projection(): MapProjectionType {
      return state.projection;
    },
    get isGlobe(): boolean {
      return state.projection === PROJECTION_GLOBE;
    },
    get isGlobeExplicitlyEnabled(): boolean {
      return state.explicitGlobe;
    },
    get flipY(): boolean {
      return state.flipY;
    },
    setProjection,
    toggle,
    reset,
    restoreFromSerialized
  };
}

export const mapProjectionStore = createMapProjectionStore();

persistenceRegistry.register({
  key: 'mapProjection',
  serialize: () => mapProjectionStore.projection,
  deserialize: (data: unknown) =>
    mapProjectionStore.restoreFromSerialized(data as MapProjectionType),
  reset: () => mapProjectionStore.reset(),
  priority: 'debounced'
});
