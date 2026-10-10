import type { DailyBar, ISODate } from '@/domain/types';
import { RateLimiter, defaultSleep, type Sleep } from './rateLimiter';

const BASE_URL = 'https://api.twelvedata.com';
const REQUEST_TIMEOUT_MS = 20_000;

export class TwelveDataError extends Error {
  constructor(
    message: string,
    /** API error code (400, 401, 403, 404, 429) or 0 for network/parse failures. */
    readonly code: number,
  ) {
    super(message);
    this.name = 'TwelveDataError';
  }

  get isRateLimit(): boolean {
    return this.code === 429;
  }

  get isAuth(): boolean {
    return this.code === 401 || this.code === 403;
  }
}

export interface SymbolRef {
  symbol: string;
  exchange?: string;
}

export interface DailySeries {
  symbol: string;
  currency: string;
  exchange?: string;
  bars: DailyBar[];
}

export interface Quote {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  close: number;
  previousClose: number;
  date: ISODate;
}

export interface PriceApi {
  getDailySeries(ref: SymbolRef, startDate: ISODate): Promise<DailySeries>;
  getQuote(ref: SymbolRef): Promise<Quote>;
}

interface ApiErrorBody {
  status: 'error';
  code: number;
  message: string;
}

interface TimeSeriesBody {
  status: 'ok';
  meta: { symbol: string; currency?: string; currency_quote?: string; exchange?: string };
  values: { datetime: string; close: string }[];
}

interface QuoteBody {
  symbol: string;
  name?: string;
  currency?: string;
  exchange?: string;
  datetime: string;
  close: string;
  previous_close: string;
}

export interface TwelveDataOptions {
  apiKey: string;
  /** Credits per minute allowed by the plan (free plan: 8). */
  creditsPerMinute?: number;
  /** How many times to wait and retry after a 429. */
  maxRetries?: number;
  fetchFn?: typeof fetch;
  sleep?: Sleep;
}

/** Typed client for the parts of the Twelve Data REST API this app uses. */
export function createTwelveDataClient(options: TwelveDataOptions): PriceApi {
  const { apiKey, creditsPerMinute = 8, maxRetries = 2, fetchFn = fetch, sleep = defaultSleep } = options;
  if (!apiKey.trim()) throw new TwelveDataError('Missing Twelve Data API key', 401);
  const limiter = new RateLimiter(creditsPerMinute, 60_000, sleep);

  async function request<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const query = Object.entries(params)
      .filter((entry): entry is [string, string] => !!entry[1])
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `${BASE_URL}${path}?${query}`;

    for (let attempt = 0; ; attempt++) {
      await limiter.acquire();
      const body = await fetchJson(url);
      if (isError(body)) {
        if (body.code === 429 && attempt < maxRetries) {
          await sleep(60_000); // credits refill every minute
          continue;
        }
        throw new TwelveDataError(body.message || 'Twelve Data request failed', body.code);
      }
      return body as T;
    }
  }

  async function fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchFn(url, {
        headers: { Authorization: `apikey ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new TwelveDataError(`Unexpected response (HTTP ${res.status})`, res.ok ? 0 : res.status);
      }
    } catch (err) {
      if (err instanceof TwelveDataError) throw err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new TwelveDataError(aborted ? 'Request timed out' : 'Network error — check your connection', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getDailySeries(ref, startDate) {
      const body = await request<TimeSeriesBody>('/time_series', {
        symbol: ref.symbol,
        exchange: ref.exchange,
        interval: '1day',
        start_date: startDate,
        order: 'asc',
        outputsize: '5000',
      });
      const bars = (body.values ?? [])
        .map((v) => ({ date: v.datetime.slice(0, 10), close: Number(v.close) }))
        .filter((b) => Number.isFinite(b.close) && b.close > 0)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return {
        symbol: body.meta.symbol,
        // FX pairs report `currency_quote` instead of `currency`.
        currency: body.meta.currency ?? body.meta.currency_quote ?? 'USD',
        exchange: body.meta.exchange,
        bars,
      };
    },

    async getQuote(ref) {
      const body = await request<QuoteBody>('/quote', { symbol: ref.symbol, exchange: ref.exchange });
      return {
        symbol: body.symbol,
        name: body.name ?? body.symbol,
        currency: body.currency ?? 'USD',
        exchange: body.exchange ?? '',
        close: Number(body.close),
        previousClose: Number(body.previous_close),
        date: body.datetime.slice(0, 10),
      };
    },
  };
}

function isError(body: unknown): body is ApiErrorBody {
  return typeof body === 'object' && body !== null && (body as { status?: string }).status === 'error';
}
