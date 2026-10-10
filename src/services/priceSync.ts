import type { PriceApi } from '@/api/twelveData';
import { TwelveDataError } from '@/api/twelveData';
import { addDays } from '@/domain/dates';
import { fxPair, instrumentKey, mergeBars, normalizeCurrency } from '@/domain/portfolio';
import type { ISODate, InstrumentKey, PriceTable, Transaction } from '@/domain/types';

/** Days re-fetched before the last cached bar, so late corrections and today's live bar refresh. */
const REFRESH_OVERLAP_DAYS = 5;

export interface SyncState {
  prices: PriceTable;
  fx: PriceTable;
  currencies: Record<InstrumentKey, string>;
}

export interface SyncProgress {
  done: number;
  total: number;
  current: string;
}

export interface SyncResult extends SyncState {
  errors: { item: string; message: string }[];
}

export interface SyncOptions {
  api: PriceApi;
  transactions: readonly Transaction[];
  state: SyncState;
  baseCurrency: string;
  onProgress?: (progress: SyncProgress) => void;
}

function startDateFor(cachedLast: ISODate | undefined, earliestNeeded: ISODate): ISODate {
  return cachedLast && cachedLast >= earliestNeeded ? addDays(cachedLast, -REFRESH_OVERLAP_DAYS) : earliestNeeded;
}

/**
 * Incrementally downloads daily closes for every instrument the user has traded,
 * then FX rates for every non-base quote currency. Failures are collected per item
 * so one bad symbol doesn't block the rest; auth errors abort immediately.
 */
export async function syncPrices(options: SyncOptions): Promise<SyncResult> {
  const { api, transactions, baseCurrency, onProgress } = options;
  const prices: PriceTable = { ...options.state.prices };
  const fx: PriceTable = { ...options.state.fx };
  const currencies = { ...options.state.currencies };
  const errors: SyncResult['errors'] = [];

  // Earliest trade date per instrument.
  const firstTrade = new Map<InstrumentKey, { symbol: string; exchange?: string; date: ISODate }>();
  for (const tx of transactions) {
    const key = instrumentKey(tx.symbol, tx.exchange);
    const existing = firstTrade.get(key);
    if (!existing || tx.date < existing.date) {
      firstTrade.set(key, { symbol: tx.symbol.toUpperCase(), exchange: tx.exchange, date: tx.date });
    }
  }
  if (firstTrade.size === 0) return { prices, fx, currencies, errors };

  const instruments = [...firstTrade.entries()];
  // FX work is unknown until currencies are learned; estimate with what's cached.
  let total = instruments.length + countFxPairs(currencies, firstTrade.keys(), baseCurrency);
  let done = 0;
  const report = (current: string) => onProgress?.({ done, total, current });

  const run = async (label: string, task: () => Promise<void>) => {
    report(label);
    try {
      await task();
    } catch (err) {
      if (err instanceof TwelveDataError && err.isAuth) throw err;
      errors.push({ item: label, message: err instanceof Error ? err.message : String(err) });
    }
    done++;
    report(label);
  };

  for (const [key, ref] of instruments) {
    await run(key, async () => {
      const cached = prices[key];
      const start = startDateFor(cached?.[cached.length - 1]?.date, ref.date);
      const series = await api.getDailySeries({ symbol: ref.symbol, exchange: ref.exchange }, start);
      prices[key] = mergeBars(cached ?? [], series.bars);
      currencies[key] = series.currency;
    });
  }

  // Earliest date each FX pair is needed from.
  const fxNeeded = new Map<string, { from: string; date: ISODate }>();
  for (const [key, ref] of instruments) {
    const quote = currencies[key];
    if (!quote) continue;
    const { code } = normalizeCurrency(quote);
    if (code === baseCurrency.toUpperCase()) continue;
    const pair = fxPair(code, baseCurrency);
    const current = fxNeeded.get(pair);
    if (!current || ref.date < current.date) fxNeeded.set(pair, { from: code, date: ref.date });
  }
  total = instruments.length + fxNeeded.size;

  for (const [pair, need] of fxNeeded) {
    await run(pair, async () => {
      const cached = fx[pair];
      // Start a few days early so the first trade day has a rate even if it was a holiday.
      const start = startDateFor(cached?.[cached.length - 1]?.date, addDays(need.date, -7));
      const series = await api.getDailySeries({ symbol: pair }, start);
      fx[pair] = mergeBars(cached ?? [], series.bars);
    });
  }

  return { prices, fx, currencies, errors };
}

function countFxPairs(
  currencies: Record<InstrumentKey, string>,
  keys: Iterable<InstrumentKey>,
  baseCurrency: string,
): number {
  const pairs = new Set<string>();
  for (const key of keys) {
    const quote = currencies[key];
    if (!quote) continue;
    const { code } = normalizeCurrency(quote);
    if (code !== baseCurrency.toUpperCase()) pairs.add(code);
  }
  return pairs.size;
}
