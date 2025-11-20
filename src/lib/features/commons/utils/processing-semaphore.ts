/**
 * Processing Semaphore - Limits concurrent operations to prevent memory exhaustion
 *
 * Used to control the number of files being processed simultaneously,
 * preventing WASM heap overflow and excessive memory usage when importing
 * multiple large datasets.
 */
export class ProcessingSemaphore {
  private active = 0;

  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number = 2) {
    if (maxConcurrent < 1) {
      throw new Error('maxConcurrent must be at least 1');
    }
  }

  /**
   * Acquire a slot in the semaphore
   * Waits if max concurrent limit is reached
   */
  private async acquire(): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.active++;
  }

  /**
   * Release a slot in the semaphore
   * Allows next queued operation to proceed
   */
  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Run an async function with semaphore control
   * Ensures only maxConcurrent operations run simultaneously
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get current number of active operations
   */
  get activeCount(): number {
    return this.active;
  }

  /**
   * Get number of operations waiting in queue
   */
  get queuedCount(): number {
    return this.queue.length;
  }

  /**
   * Check if semaphore is at capacity
   */
  get isAtCapacity(): boolean {
    return this.active >= this.maxConcurrent;
  }
}
