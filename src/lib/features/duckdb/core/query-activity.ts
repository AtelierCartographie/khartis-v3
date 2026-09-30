let queriesInFlight = 0;
let lastQuerySettledAt = 0;

export async function trackQuery<T>(run: () => Promise<T>): Promise<T> {
  queriesInFlight += 1;
  try {
    return await run();
  } finally {
    queriesInFlight -= 1;
    lastQuerySettledAt = performance.now();
  }
}

/**
 * Resolves once no query has been running for idleMs, so background work only
 * takes the single DuckDB connection when nothing else is waiting for it.
 */
export async function waitForQueryIdle(idleMs: number): Promise<void> {
  while (
    queriesInFlight > 0 ||
    performance.now() - lastQuerySettledAt < idleMs
  ) {
    await new Promise((resolve) => setTimeout(resolve, idleMs));
  }
}
