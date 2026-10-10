/** Calendar date in `YYYY-MM-DD` form. Always interpreted as a whole day, never a timestamp. */
export type ISODate = string;

export type TransactionType = 'BUY' | 'SELL';

/** A single trade entered by the user. Prices and fees are in the instrument's quote currency. */
export interface Transaction {
  id: string;
  symbol: string;
  /** Optional exchange code (e.g. `XETR`, `Euronext`) to disambiguate listings. */
  exchange?: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  date: ISODate;
  note?: string;
  createdAt: number;
}

/** Static metadata about a tradable instrument, learned from the price API. */
export interface Instrument {
  key: InstrumentKey;
  symbol: string;
  exchange?: string;
  name?: string;
  currency: string;
}

/** Stable identifier of an instrument: `SYMBOL` or `SYMBOL:EXCHANGE`. */
export type InstrumentKey = string;

export interface DailyBar {
  date: ISODate;
  close: number;
}

/** Bars per instrument key (or FX pair), sorted ascending by date. */
export type PriceTable = Record<string, DailyBar[]>;

export interface HoldingDay {
  key: InstrumentKey;
  quantity: number;
  /** Close in quote currency (forward-filled over non-trading days). */
  close: number;
  /** Market value in base currency. */
  value: number;
  /** Gain for the day in base currency, net of cash flows. */
  dayGain: number;
}

export interface DailyPoint {
  date: ISODate;
  /** Total market value in base currency at the day's close. */
  value: number;
  /** Cumulative net cash put into the portfolio (buys − sells), base currency. */
  invested: number;
  /** Market gain for the day: Δvalue minus the day's net cash flow. */
  dayGain: number;
  /** dayGain relative to the capital at work that day. */
  dayGainPct: number;
  holdings: HoldingDay[];
}

export interface Position {
  key: InstrumentKey;
  symbol: string;
  exchange?: string;
  quantity: number;
  /** Average cost per unit in quote currency (average-cost method, fees included). */
  averageCost: number;
  /** Realized gain in quote currency. */
  realizedGain: number;
}
