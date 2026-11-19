/**
 * Asks the map to fade the next redraw in: a new projection or a new
 * visualization redraws the whole map at once, and the fade marks it.
 */
function createMapRevealStore() {
  let version = $state(0);

  return {
    get version(): number {
      return version;
    },
    request(): void {
      version += 1;
    }
  };
}

export const mapRevealStore = createMapRevealStore();
