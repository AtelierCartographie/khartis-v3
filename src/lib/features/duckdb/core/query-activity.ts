let queriesInFlight = 0;
let lastQuerySettledAt = 0;
let connectionTail: Promise<unknown> = Promise.resolve();

/**
 * Runs queries on the single DuckDB connection one at a time. A streaming
 * query spans many worker round-trips, and any statement sent between two of
 * them closes its pending result: the stream then ends early, without error,
 * on a truncated table.
 */
export async function trackQuery<T>(run: () => Promise<T>): Promise<T> {
  const connectionIsFree = queriesInFlight === 0;
  queriesInFlight += 1;
  try {
    const current = connectionIsFree ? run() : connectionTail.then(run, run);
    connectionTail = current.catch(() => undefined);
    return await current;
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
