export type Sleep = (ms: number) => Promise<void>;

export const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window limiter: at most `limit` acquisitions in any `windowMs` interval.
 * Twelve Data's free plan allows 8 credits per minute, one credit per symbol request.
 */
export class RateLimiter {
  private readonly timestamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly sleep: Sleep = defaultSleep,
    private readonly now: () => number = Date.now,
  ) {
    if (limit < 1) throw new Error('Rate limit must be at least 1');
  }

  /** Resolves when a slot is available. Calls are served in FIFO order. */
  acquire(): Promise<void> {
    const next = this.queue.then(() => this.waitForSlot());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = this.now();
      while (this.timestamps.length > 0 && now - this.timestamps[0]! >= this.windowMs) {
        this.timestamps.shift();
      }
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now);
        return;
      }
      await this.sleep(this.windowMs - (now - this.timestamps[0]!) + 50);
    }
  }
}
