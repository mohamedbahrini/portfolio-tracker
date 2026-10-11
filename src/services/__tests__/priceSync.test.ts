import { RateLimiter } from '@/api/rateLimiter';
import { TwelveDataError, createTwelveDataClient, type PriceApi } from '@/api/twelveData';
import type { Transaction } from '@/domain/types';
import { syncPrices } from '../priceSync';

const baseTx = { type: 'BUY' as const, quantity: 1, price: 1, fee: 0, createdAt: 0 };

function fakeApi(overrides: Partial<PriceApi> = {}): PriceApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getDailySeries(ref, start) {
      calls.push(`${ref.symbol}@${start}`);
      if (ref.symbol === 'BAD') throw new TwelveDataError('symbol not found', 404);
      const currency = ref.symbol.includes('/') ? 'EUR' : ref.symbol === 'SAP' ? 'EUR' : 'USD';
      return { symbol: ref.symbol, currency, bars: [{ date: '2026-10-09', close: 10 }] };
    },
    async getQuote() {
      throw new Error('not used');
    },
    ...overrides,
  };
}

describe('syncPrices', () => {
  const transactions: Transaction[] = [
    { ...baseTx, id: '1', symbol: 'AAPL', date: '2026-01-05' },
    { ...baseTx, id: '2', symbol: 'AAPL', date: '2025-06-02' },
    { ...baseTx, id: '3', symbol: 'SAP', date: '2026-02-02' },
    { ...baseTx, id: '4', symbol: 'BAD', date: '2026-02-02' },
  ];

  it('fetches full history from first trade, then needed FX pairs, collecting errors', async () => {
    const api = fakeApi();
    const progress: number[] = [];
    const result = await syncPrices({
      api,
      transactions,
      state: { prices: {}, fx: {}, currencies: {} },
      baseCurrency: 'EUR',
      onProgress: (p) => progress.push(p.done),
    });
    expect(api.calls).toEqual(['AAPL@2025-06-02', 'SAP@2026-02-02', 'BAD@2026-02-02', 'USD/EUR@2025-05-26']);
    expect(result.currencies).toEqual({ AAPL: 'USD', SAP: 'EUR' });
    expect(Object.keys(result.fx)).toEqual(['USD/EUR']);
    expect(result.errors).toEqual([{ item: 'BAD', message: 'symbol not found' }]);
    expect(progress[progress.length - 1]).toBe(4);
  });

  it('only refreshes recent days when history is cached', async () => {
    const api = fakeApi();
    await syncPrices({
      api,
      transactions: transactions.slice(0, 1),
      state: { prices: { AAPL: [{ date: '2026-10-01', close: 5 }] }, fx: {}, currencies: { AAPL: 'USD' } },
      baseCurrency: 'USD',
    });
    expect(api.calls).toEqual(['AAPL@2026-09-26']);
  });

  it('sends symbols in batches and never more than the batch size at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const batches: string[][] = [];
    const api = fakeApi({
      getDailySeries: async (ref) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return { symbol: ref.symbol, currency: 'USD', bars: [] };
      },
    });
    const many: Transaction[] = Array.from({ length: 19 }, (_, i) => ({
      ...baseTx,
      id: String(i),
      symbol: `S${i}`,
      date: '2026-01-02',
    }));
    await syncPrices({
      api,
      transactions: many,
      state: { prices: {}, fx: {}, currencies: {} },
      baseCurrency: 'USD',
      batchSize: 8,
      onProgress: (p) => {
        const labels = p.current.split(', ');
        if (batches[batches.length - 1]?.join() !== labels.join()) batches.push(labels);
      },
    });
    expect(peak).toBe(8);
    expect(batches.map((b) => b.length)).toEqual([8, 8, 3]);
  });

  it('aborts on authentication errors', async () => {
    const api = fakeApi({
      getDailySeries: async () => {
        throw new TwelveDataError('invalid key', 401);
      },
    });
    await expect(
      syncPrices({ api, transactions, state: { prices: {}, fx: {}, currencies: {} }, baseCurrency: 'USD' }),
    ).rejects.toThrow('invalid key');
  });
});

describe('createTwelveDataClient', () => {
  function response(body: unknown) {
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  }

  it('parses a time series and sends the key as a header', async () => {
    const fetchFn = jest.fn(async () =>
      response({
        status: 'ok',
        meta: { symbol: 'AAPL', currency: 'USD' },
        values: [
          { datetime: '2026-10-09', close: '227.5' },
          { datetime: '2026-10-08', close: '225.1' },
        ],
      }),
    );
    const client = createTwelveDataClient({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
      limiter: new RateLimiter(8),
    });
    const series = await client.getDailySeries({ symbol: 'AAPL' }, '2026-10-01');
    expect(series.bars).toEqual([
      { date: '2026-10-08', close: 225.1 },
      { date: '2026-10-09', close: 227.5 },
    ]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('symbol=AAPL');
    expect(url).toContain('start_date=2026-10-01');
    expect(url).not.toContain('apikey');
    expect((init.headers as Record<string, string>).Authorization).toBe('apikey k');
  });

  it('after a 429, retries once in the next minute', async () => {
    let now = 0;
    const sleep = jest.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = new RateLimiter(8, 60_000, sleep, () => now);
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response({ status: 'error', code: 429, message: 'limit' }))
      .mockResolvedValueOnce(response({ status: 'ok', meta: { symbol: 'X' }, values: [] }));
    const client = createTwelveDataClient({ apiKey: 'k', fetchFn, limiter });
    await expect(client.getDailySeries({ symbol: 'X' }, '2026-01-01')).resolves.toMatchObject({ bars: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(now).toBeGreaterThanOrEqual(60_000);
  });

  it('gives up after one retry', async () => {
    let now = 0;
    const limiter = new RateLimiter(8, 60_000, async (ms) => void (now += ms), () => now);
    const fetchFn = jest.fn(async () => response({ status: 'error', code: 429, message: 'limit' }));
    const client = createTwelveDataClient({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch, limiter });
    await expect(client.getQuote({ symbol: 'X' })).rejects.toMatchObject({ isRateLimit: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('surfaces API errors with their code', async () => {
    const fetchFn = jest.fn(async () => response({ status: 'error', code: 401, message: 'bad key' }));
    const client = createTwelveDataClient({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
      limiter: new RateLimiter(8),
    });
    await expect(client.getQuote({ symbol: 'X' })).rejects.toMatchObject({ code: 401, isAuth: true });
  });
});
