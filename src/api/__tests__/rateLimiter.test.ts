import { RateLimiter } from '../rateLimiter';

function fakeClock() {
  let now = 1_000_000;
  const waits: number[] = [];
  return {
    now: () => now,
    advance: (ms: number) => (now += ms),
    waits,
    sleep: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
  };
}

describe('RateLimiter (fixed one-minute batches)', () => {
  it('lets a full batch through, then waits for the next minute', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(8, 60_000, clock.sleep, clock.now);
    const started: number[] = [];
    await Promise.all(
      Array.from({ length: 20 }, () => limiter.acquire().then(() => started.push(clock.now()))),
    );
    const t0 = started[0]!;
    const offsets = started.map((t) => t - t0);
    // 8 at once, 8 after a minute, the last 4 a minute later.
    expect(offsets.slice(0, 8).every((o) => o === 0)).toBe(true);
    expect(new Set(offsets.slice(8, 16)).size).toBe(1);
    expect(offsets[8]).toBeGreaterThanOrEqual(60_000);
    expect(offsets[16]).toBeGreaterThanOrEqual(120_000);
    expect(offsets).toHaveLength(20);
  });

  it('does not wait when the previous batch is already a minute old', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(2, 60_000, clock.sleep, clock.now);
    await limiter.acquire();
    await limiter.acquire();
    clock.advance(70_000);
    await limiter.acquire();
    expect(clock.waits).toEqual([]);
  });

  it('exhaust() pushes the next request into a fresh minute and notifies listeners', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(8, 60_000, clock.sleep, clock.now);
    const notified: number[] = [];
    limiter.onWait((at) => notified.push(at));
    await limiter.acquire();
    limiter.exhaust();
    const before = clock.now();
    await limiter.acquire();
    expect(clock.now() - before).toBeGreaterThanOrEqual(60_000);
    expect(notified).toHaveLength(1);
  });
});
