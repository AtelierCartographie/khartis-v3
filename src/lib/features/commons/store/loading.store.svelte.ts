function createLoadingStore() {
  let count = $state(0);

  return {
    get isLoading() {
      return count > 0;
    },
    start() {
      count++;
    },
    stop() {
      count = Math.max(0, count - 1);
    }
  };
}

export const loadingStore = createLoadingStore();
