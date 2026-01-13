export type MapProjectionType = 'mercator' | 'globe';

const DEFAULT_MAP_PROJECTION: MapProjectionType = 'mercator';

class MapProjectionStore {
  private _state = $state({
    projection: DEFAULT_MAP_PROJECTION as MapProjectionType
  });

  get projection(): MapProjectionType {
    return this._state.projection;
  }

  get isGlobe(): boolean {
    return this._state.projection === 'globe';
  }

  setProjection(projection: MapProjectionType): void {
    this._state.projection = projection;
  }

  toggle(): void {
    this._state.projection =
      this._state.projection === 'mercator' ? 'globe' : 'mercator';
  }

  reset(): void {
    this._state.projection = DEFAULT_MAP_PROJECTION;
  }
}

export const mapProjectionStore = new MapProjectionStore();
