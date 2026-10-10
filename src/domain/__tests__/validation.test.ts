import type { Transaction } from '../types';
import { parseDecimal, validateTransaction, type TransactionDraft } from '../validation';

const draft = (p: Partial<TransactionDraft> = {}): TransactionDraft => ({
  type: 'BUY',
  symbol: 'aapl',
  exchange: '',
  date: '2026-10-01',
  quantity: '2',
  price: '150,5',
  fee: '',
  ...p,
});

const owned: Transaction[] = [
  { id: 'a', type: 'BUY', symbol: 'AAPL', date: '2026-09-01', quantity: 5, price: 100, fee: 0, createdAt: 1 },
  { id: 'b', type: 'SELL', symbol: 'AAPL', date: '2026-10-05', quantity: 4, price: 120, fee: 0, createdAt: 2 },
];

describe('validateTransaction', () => {
  it('normalizes a valid buy', () => {
    const { errors, value } = validateTransaction(draft(), [], '2026-10-10');
    expect(errors).toEqual({});
    expect(value).toMatchObject({ symbol: 'AAPL', price: 150.5, quantity: 2, fee: 0, exchange: undefined });
  });

  it('rejects bad input and future dates', () => {
    const { errors } = validateTransaction(
      draft({ symbol: '', quantity: '0', price: 'x', fee: '-1', date: '2026-12-01' }),
      [],
      '2026-10-10',
    );
    expect(Object.keys(errors).sort()).toEqual(['date', 'fee', 'price', 'quantity', 'symbol']);
  });

  it('rejects selling more than held on the date', () => {
    const { errors } = validateTransaction(draft({ type: 'SELL', quantity: '6' }), owned, '2026-10-10');
    expect(errors.quantity).toMatch(/only held 5/);
  });

  it('rejects a sell that would break a later recorded sell', () => {
    const { errors } = validateTransaction(draft({ type: 'SELL', quantity: '2' }), owned, '2026-10-10');
    expect(errors.quantity).toMatch(/later sell/);
  });

  it('accepts a sell within holdings', () => {
    expect(validateTransaction(draft({ type: 'SELL', quantity: '1' }), owned, '2026-10-10').value).toBeDefined();
  });
});

describe('parseDecimal', () => {
  it('accepts comma decimals and rejects empty', () => {
    expect(parseDecimal(' 1 234,5 ')).toBe(1234.5);
    expect(parseDecimal('')).toBeNaN();
  });
});
