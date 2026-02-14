export interface ProcessingSemaphore {
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly activeCount: number;
  readonly queuedCount: number;
  readonly isAtCapacity: boolean;
}

export function createProcessingSemaphore(
  maxConcurrent: number = 2
): ProcessingSemaphore {
  if (maxConcurrent < 1) {
    throw new Error('maxConcurrent must be at least 1');
  }

  let active = 0;
  const queue: Array<() => void> = [];

  async function acquire(): Promise<void> {
    while (active >= maxConcurrent) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    }
    active++;
  }

  function release(): void {
    active--;
    const next = queue.shift();
    if (next) {
      next();
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    run,
    get activeCount(): number {
      return active;
    },
    get queuedCount(): number {
      return queue.length;
    },
    get isAtCapacity(): boolean {
      return active >= maxConcurrent;
    }
  };
}
