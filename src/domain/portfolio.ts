import type {
  DailyBar,
  DailyPoint,
  HoldingDay,
  ISODate,
  InstrumentKey,
  Position,
  PriceTable,
  Transaction,
} from './types';

const EPSILON = 1e-9;

export function instrumentKey(symbol: string, exchange?: string): InstrumentKey {
  const s = symbol.trim().toUpperCase();
  const e = exchange?.trim();
  return e ? `${s}:${e}` : s;
}

export function fxPair(from: string, to: string): string {
  return `${from.toUpperCase()}/${to.toUpperCase()}`;
}

/**
 * Some exchanges quote in minor units (London: `GBp` = pence). Returns the ISO code
 * and the factor that converts a quoted amount into that code.
 */
export function normalizeCurrency(currency: string): { code: string; factor: number } {
  const trimmed = currency.trim();
  if (trimmed === 'GBp' || trimmed === 'GBX') return { code: 'GBP', factor: 0.01 };
  if (trimmed === 'ZAc' || trimmed === 'ZAC') return { code: 'ZAR', factor: 0.01 };
  if (trimmed === 'ILA') return { code: 'ILS', factor: 0.01 };
  return { code: trimmed.toUpperCase(), factor: 1 };
}

export function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );
}

/** Signed cash flow of a trade in quote currency: positive = money put in. */
export function cashFlowOf(tx: Transaction): number {
  const gross = tx.quantity * tx.price;
  return tx.type === 'BUY' ? gross + tx.fee : -(gross - tx.fee);
}

/** Current open positions using the average-cost method. */
export function computePositions(transactions: readonly Transaction[]): Position[] {
  const map = new Map<InstrumentKey, Position>();
  for (const tx of sortTransactions(transactions)) {
    const key = instrumentKey(tx.symbol, tx.exchange);
    const pos =
      map.get(key) ??
      ({ key, symbol: tx.symbol.toUpperCase(), exchange: tx.exchange, quantity: 0, averageCost: 0, realizedGain: 0 } as Position);
    if (tx.type === 'BUY') {
      const totalCost = pos.averageCost * pos.quantity + tx.quantity * tx.price + tx.fee;
      pos.quantity += tx.quantity;
      pos.averageCost = pos.quantity > EPSILON ? totalCost / pos.quantity : 0;
    } else {
      const sold = Math.min(tx.quantity, pos.quantity);
      pos.realizedGain += sold * (tx.price - pos.averageCost) - tx.fee;
      pos.quantity -= sold;
      if (pos.quantity <= EPSILON) {
        pos.quantity = 0;
        pos.averageCost = 0;
      }
    }
    map.set(key, pos);
  }
  return [...map.values()];
}

/** Quantity held of an instrument at the end of `date`, ignoring transaction `excludeId`. */
export function quantityHeld(
  transactions: readonly Transaction[],
  key: InstrumentKey,
  date: ISODate,
  excludeId?: string,
): number {
  let qty = 0;
  for (const tx of transactions) {
    if (tx.id === excludeId || tx.date > date) continue;
    if (instrumentKey(tx.symbol, tx.exchange) !== key) continue;
    qty += tx.type === 'BUY' ? tx.quantity : -tx.quantity;
  }
  return qty;
}

/** Walks an ascending bar list forward, returning the latest close on or before each queried date. */
class ForwardFill {
  private index = -1;
  constructor(private readonly bars: readonly DailyBar[]) {}

  at(date: ISODate): number | undefined {
    while (this.index + 1 < this.bars.length && this.bars[this.index + 1]!.date <= date) {
      this.index++;
    }
    return this.index >= 0 ? this.bars[this.index]!.close : undefined;
  }

  /** Earliest known close; used as a fallback before history starts. */
  first(): number | undefined {
    return this.bars[0]?.close;
  }
}

export interface SeriesInput {
  transactions: readonly Transaction[];
  prices: PriceTable;
  /** FX bars keyed by pair `FROM/BASE`. */
  fx: PriceTable;
  /** Quote currency per instrument key. Missing entries are assumed to be in the base currency. */
  currencies: Record<InstrumentKey, string>;
  baseCurrency: string;
  /** Last date to include (inclusive), usually today. */
  endDate: ISODate;
}

export interface SeriesResult {
  points: DailyPoint[];
  /** Instruments or FX pairs that had no market data and fell back to trade prices / 1.0. */
  missing: string[];
}

/**
 * Builds the daily portfolio valuation from the first trade to `endDate`.
 *
 * Days are the union of all market dates and trade dates. Prices and FX rates are
 * forward-filled across gaps; before an instrument has any market data its latest
 * trade price is used instead.
 *
 * Daily gain is `value(d) − value(d−1) − netCashFlow(d)`, so buying or selling
 * never shows up as a gain or loss by itself.
 */
export function buildDailySeries(input: SeriesInput): SeriesResult {
  const { prices, fx, currencies, baseCurrency, endDate } = input;
  const transactions = sortTransactions(input.transactions).filter((t) => t.date <= endDate);
  if (transactions.length === 0) return { points: [], missing: [] };

  const startDate = transactions[0]!.date;
  const keys = [...new Set(transactions.map((t) => instrumentKey(t.symbol, t.exchange)))];
  const missing = new Set<string>();

  const dateSet = new Set<ISODate>(transactions.map((t) => t.date));
  for (const key of keys) {
    for (const bar of prices[key] ?? []) {
      if (bar.date >= startDate && bar.date <= endDate) dateSet.add(bar.date);
    }
  }
  const dates = [...dateSet].sort();

  const priceFill = new Map(keys.map((k) => [k, new ForwardFill(prices[k] ?? [])]));
  const fxFill = new Map<string, ForwardFill>();
  const rateFor = (key: InstrumentKey, date: ISODate): number => {
    const { code, factor } = normalizeCurrency(currencies[key] ?? baseCurrency);
    if (code === baseCurrency.toUpperCase()) return factor;
    const pair = fxPair(code, baseCurrency);
    let fill = fxFill.get(pair);
    if (!fill) {
      fill = new ForwardFill(fx[pair] ?? []);
      fxFill.set(pair, fill);
    }
    const rate = fill.at(date) ?? fill.first();
    if (rate === undefined) {
      missing.add(pair);
      return factor;
    }
    return rate * factor;
  };

  const quantity = new Map<InstrumentKey, number>(keys.map((k) => [k, 0]));
  const lastTradePrice = new Map<InstrumentKey, number>();
  const previousValue = new Map<InstrumentKey, number>(keys.map((k) => [k, 0]));
  let invested = 0;
  let txIndex = 0;
  const points: DailyPoint[] = [];

  for (const date of dates) {
    const flowByKey = new Map<InstrumentKey, number>();
    while (txIndex < transactions.length && transactions[txIndex]!.date === date) {
      const tx = transactions[txIndex++]!;
      const key = instrumentKey(tx.symbol, tx.exchange);
      quantity.set(key, (quantity.get(key) ?? 0) + (tx.type === 'BUY' ? tx.quantity : -tx.quantity));
      lastTradePrice.set(key, tx.price);
      const flow = cashFlowOf(tx) * rateFor(key, date);
      flowByKey.set(key, (flowByKey.get(key) ?? 0) + flow);
    }

    let value = 0;
    let dayGain = 0;
    let dayFlow = 0;
    let previousTotal = 0;
    const holdings: HoldingDay[] = [];

    for (const key of keys) {
      const qty = quantity.get(key) ?? 0;
      const prev = previousValue.get(key) ?? 0;
      const flow = flowByKey.get(key) ?? 0;
      if (Math.abs(qty) <= EPSILON && prev === 0 && flow === 0) continue;

      let close = priceFill.get(key)!.at(date);
      if (close === undefined) {
        close = lastTradePrice.get(key) ?? 0;
        missing.add(key);
      }
      const holdingValue = Math.abs(qty) <= EPSILON ? 0 : qty * close * rateFor(key, date);
      const holdingGain = holdingValue - prev - flow;

      value += holdingValue;
      dayGain += holdingGain;
      dayFlow += flow;
      previousTotal += prev;
      previousValue.set(key, holdingValue);
      holdings.push({ key, quantity: qty, close, value: holdingValue, dayGain: holdingGain });
    }

    invested += dayFlow;
    const basis = previousTotal + Math.max(dayFlow, 0);
    points.push({
      date,
      value,
      invested,
      dayGain,
      dayGainPct: basis > EPSILON ? dayGain / basis : 0,
      holdings,
    });
  }

  // A missing key only matters if it never got real data; drop keys whose history exists.
  for (const key of keys) if ((prices[key]?.length ?? 0) > 0) missing.delete(key);
  return { points, missing: [...missing] };
}

export interface PortfolioSummary {
  value: number;
  invested: number;
  totalGain: number;
  totalGainPct: number;
  dayGain: number;
  dayGainPct: number;
  asOf?: ISODate;
}

export function summarize(points: readonly DailyPoint[]): PortfolioSummary {
  const last = points[points.length - 1];
  if (!last) {
    return { value: 0, invested: 0, totalGain: 0, totalGainPct: 0, dayGain: 0, dayGainPct: 0 };
  }
  const totalGain = last.value - last.invested;
  return {
    value: last.value,
    invested: last.invested,
    totalGain,
    totalGainPct: last.invested > EPSILON ? totalGain / last.invested : 0,
    dayGain: last.dayGain,
    dayGainPct: last.dayGainPct,
    asOf: last.date,
  };
}

/** Sum of daily gains for points whose date starts with `prefix` (e.g. `2026-10`). */
export function periodGain(points: readonly DailyPoint[], prefix: string): number {
  return points.reduce((sum, p) => (p.date.startsWith(prefix) ? sum + p.dayGain : sum), 0);
}

/** Merges new bars into existing ones; new bars win on the same date. Result is ascending. */
export function mergeBars(existing: readonly DailyBar[], incoming: readonly DailyBar[]): DailyBar[] {
  const byDate = new Map<ISODate, number>();
  for (const bar of existing) byDate.set(bar.date, bar.close);
  for (const bar of incoming) byDate.set(bar.date, bar.close);
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, close]) => ({ date, close }));
}
