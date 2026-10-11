export type Sleep = (ms: number) => Promise<void>;

export const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Extra wait after each minute so batches never straddle Twelve Data's reset. */
const SAFETY_MARGIN_MS = 1_500;

/**
 * Fixed-window limiter: allows `limit` requests in a batch, then holds every further
 * request until a full minute has passed since that batch started, and opens the next batch.
 *
 * With Twelve Data's free plan (8 credits/minute) this sends 8 requests, waits for the
 * minute to roll over, sends the next 8, and so on — never more than 8 in any minute.
 */
export class RateLimiter {
  private windowStart = Number.NEGATIVE_INFINITY;
  private used = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly waitListeners = new Set<(resumeAt: number) => void>();

  constructor(
    readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly sleep: Sleep = defaultSleep,
    private readonly now: () => number = Date.now,
  ) {
    if (limit < 1) throw new Error('Rate limit must be at least 1');
  }

  /** Resolves when the request may be sent. Calls are served in FIFO order. */
  acquire(): Promise<void> {
    const next = this.queue.then(() => this.waitForSlot());
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Marks the current minute as used up, e.g. after the API answered 429 because the
   * same key was used elsewhere. The next request waits for a fresh minute.
   */
  exhaust(): void {
    const now = this.now();
    if (now >= this.windowEnd()) this.windowStart = now;
    this.used = this.limit;
  }

  /** Notified with the timestamp the next batch starts whenever a request has to wait. */
  onWait(listener: (resumeAt: number) => void): () => void {
    this.waitListeners.add(listener);
    return () => this.waitListeners.delete(listener);
  }

  private windowEnd(): number {
    return this.windowStart + this.windowMs + SAFETY_MARGIN_MS;
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = this.now();
      if (now >= this.windowEnd()) {
        this.windowStart = now;
        this.used = 0;
      }
      if (this.used < this.limit) {
        this.used++;
        return;
      }
      const resumeAt = this.windowEnd();
      this.waitListeners.forEach((l) => l(resumeAt));
      await this.sleep(resumeAt - now);
    }
  }
}

let shared: RateLimiter | null = null;

/**
 * One limiter for the whole app, so syncing, adding trades and verifying the key
 * all draw from the same per-minute budget.
 */
export function getSharedLimiter(creditsPerMinute: number): RateLimiter {
  if (!shared || shared.limit !== creditsPerMinute) shared = new RateLimiter(creditsPerMinute);
  return shared;
}
