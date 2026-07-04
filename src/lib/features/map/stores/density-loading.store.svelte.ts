function createDensityLoadingStore() {
  let count = $state(0);

  return {
    get isLoading(): boolean {
      return count > 0;
    },
    begin(): void {
      count += 1;
    },
    end(): void {
      count = Math.max(0, count - 1);
    }
  };
}

export const densityLoadingStore = createDensityLoadingStore();
