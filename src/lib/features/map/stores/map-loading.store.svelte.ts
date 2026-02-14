function createMapLoadingStore() {
  const state = $state({
    isUpdatingLayers: false
  });

  function setUpdatingLayers(value: boolean): void {
    state.isUpdatingLayers = value;
  }

  return {
    get isUpdatingLayers(): boolean {
      return state.isUpdatingLayers;
    },
    setUpdatingLayers
  };
}

export const mapLoadingStore = createMapLoadingStore();
