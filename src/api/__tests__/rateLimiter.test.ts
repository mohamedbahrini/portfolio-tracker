import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  it('waits for the window to slide once the limit is reached', async () => {
    let now = 0;
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      now += ms;
    };
    const limiter = new RateLimiter(2, 60_000, sleep, () => now);
    await limiter.acquire();
    await limiter.acquire();
    expect(waits).toEqual([]);
    await limiter.acquire();
    expect(waits).toEqual([60_050]);
  });
});
