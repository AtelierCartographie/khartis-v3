class MapLoadingStore {
  private _state = $state({
    isUpdatingLayers: false
  });

  get isUpdatingLayers(): boolean {
    return this._state.isUpdatingLayers;
  }

  setUpdatingLayers(value: boolean): void {
    this._state.isUpdatingLayers = value;
  }
}

export const mapLoadingStore = new MapLoadingStore();
