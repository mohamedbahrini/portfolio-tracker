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
    const client = createTwelveDataClient({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
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

  it('retries after a rate-limit error', async () => {
    const sleep = jest.fn(async () => undefined);
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response({ status: 'error', code: 429, message: 'limit' }))
      .mockResolvedValueOnce(response({ status: 'ok', meta: { symbol: 'X' }, values: [] }));
    const client = createTwelveDataClient({ apiKey: 'k', fetchFn, sleep });
    await expect(client.getDailySeries({ symbol: 'X' }, '2026-01-01')).resolves.toMatchObject({ bars: [] });
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it('surfaces API errors with their code', async () => {
    const fetchFn = jest.fn(async () => response({ status: 'error', code: 401, message: 'bad key' }));
    const client = createTwelveDataClient({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.getQuote({ symbol: 'X' })).rejects.toMatchObject({ code: 401, isAuth: true });
  });
});
