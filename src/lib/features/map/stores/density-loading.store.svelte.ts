/**
 * Tracks in-flight density renderings so the map can show a small overlay
 * loader during the ~500 ms–2 s DuckDB macro + Arrow parse phase.
 *
 * The counter-based API lets concurrent datasets increment/decrement
 * independently without racing — the overlay is visible as long as at
 * least one density render is in flight.
 */
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
    },
    reset(): void {
      count = 0;
    }
  };
}

export const densityLoadingStore = createDensityLoadingStore();
