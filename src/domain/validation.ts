import { isISODate } from './dates';
import { instrumentKey, sortTransactions } from './portfolio';
import type { ISODate, Transaction, TransactionType } from './types';

export interface TransactionDraft {
  type: TransactionType;
  symbol: string;
  exchange: string;
  date: ISODate;
  quantity: string;
  price: string;
  fee: string;
}

export type DraftErrors = Partial<Record<keyof TransactionDraft, string>>;

const SYMBOL_RE = /^[A-Za-z0-9.\-/:^=]{1,20}$/;

/** Parses a user-entered decimal, accepting a comma as decimal separator. */
export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
}

/**
 * Validates a trade form against existing trades. A sell must never take the running
 * position below zero, including for sells already recorded after its date.
 */
export function validateTransaction(
  draft: TransactionDraft,
  existing: readonly Transaction[],
  today: ISODate,
): { errors: DraftErrors; value?: Omit<Transaction, 'id' | 'createdAt'> } {
  const errors: DraftErrors = {};
  const symbol = draft.symbol.trim().toUpperCase();
  const exchange = draft.exchange.trim() || undefined;
  const quantity = parseDecimal(draft.quantity);
  const price = parseDecimal(draft.price);
  const fee = draft.fee.trim() === '' ? 0 : parseDecimal(draft.fee);

  if (!SYMBOL_RE.test(symbol)) errors.symbol = 'Enter a ticker such as AAPL or MC';
  if (!isISODate(draft.date)) errors.date = 'Pick a valid date';
  else if (draft.date > today) errors.date = 'Date can’t be in the future';
  if (!(quantity > 0)) errors.quantity = 'Quantity must be greater than 0';
  if (!(price > 0)) errors.price = 'Price must be greater than 0';
  if (!(fee >= 0)) errors.fee = 'Fee can’t be negative';

  if (Object.keys(errors).length > 0) return { errors };

  const value = { type: draft.type, symbol, exchange, date: draft.date, quantity, price, fee };

  if (draft.type === 'SELL') {
    const key = instrumentKey(symbol, exchange);
    const candidate: Transaction = { ...value, id: '__draft__', createdAt: Number.MAX_SAFE_INTEGER };
    let running = 0;
    let available = 0;
    for (const tx of sortTransactions([...existing, candidate])) {
      if (instrumentKey(tx.symbol, tx.exchange) !== key) continue;
      if (tx.id === candidate.id) available = running;
      running += tx.type === 'BUY' ? tx.quantity : -tx.quantity;
      if (running < -1e-9) {
        errors.quantity =
          tx.id === candidate.id
            ? `You only held ${+available.toFixed(6)} ${symbol} on that date`
            : `A later sell of ${symbol} would exceed your holdings`;
        return { errors };
      }
    }
  }

  return { errors, value };
}
