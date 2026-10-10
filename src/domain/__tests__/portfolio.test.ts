import {
  buildDailySeries,
  computePositions,
  mergeBars,
  normalizeCurrency,
  periodGain,
  quantityHeld,
  summarize,
} from '../portfolio';
import type { Transaction } from '../types';

let seq = 0;
function tx(partial: Partial<Transaction> & Pick<Transaction, 'symbol' | 'date'>): Transaction {
  seq++;
  return { id: `t${seq}`, type: 'BUY', quantity: 1, price: 100, fee: 0, createdAt: seq, ...partial };
}

describe('computePositions', () => {
  it('uses average cost including fees and realizes gains on sell', () => {
    const positions = computePositions([
      tx({ symbol: 'aapl', date: '2026-01-02', quantity: 10, price: 100, fee: 10 }),
      tx({ symbol: 'AAPL', date: '2026-01-05', quantity: 10, price: 120 }),
      tx({ symbol: 'AAPL', date: '2026-02-01', type: 'SELL', quantity: 5, price: 150, fee: 5 }),
    ]);
    expect(positions).toHaveLength(1);
    const p = positions[0]!;
    expect(p.quantity).toBe(15);
    expect(p.averageCost).toBeCloseTo(110.5); // (1010 + 1200) / 20
    expect(p.realizedGain).toBeCloseTo(5 * (150 - 110.5) - 5);
  });

  it('separates the same symbol on different exchanges', () => {
    const positions = computePositions([
      tx({ symbol: 'SAP', date: '2026-01-02' }),
      tx({ symbol: 'SAP', exchange: 'XETR', date: '2026-01-02' }),
    ]);
    expect(positions.map((p) => p.key).sort()).toEqual(['SAP', 'SAP:XETR']);
  });
});

describe('quantityHeld', () => {
  it('counts trades up to and including the date', () => {
    const list = [
      tx({ symbol: 'MSFT', date: '2026-01-02', quantity: 3 }),
      tx({ symbol: 'MSFT', date: '2026-01-10', type: 'SELL', quantity: 1 }),
    ];
    expect(quantityHeld(list, 'MSFT', '2026-01-09')).toBe(3);
    expect(quantityHeld(list, 'MSFT', '2026-01-10')).toBe(2);
    expect(quantityHeld(list, 'MSFT', '2026-01-10', list[1]!.id)).toBe(3);
  });
});

describe('buildDailySeries', () => {
  const prices = {
    AAPL: [
      { date: '2026-03-02', close: 100 },
      { date: '2026-03-03', close: 110 },
      { date: '2026-03-04', close: 105 },
      { date: '2026-03-06', close: 120 },
    ],
  };

  it('computes daily gains net of cash flows', () => {
    const { points, missing } = buildDailySeries({
      transactions: [
        tx({ symbol: 'AAPL', date: '2026-03-02', quantity: 10, price: 98 }),
        tx({ symbol: 'AAPL', date: '2026-03-04', quantity: 10, price: 104 }),
      ],
      prices,
      fx: {},
      currencies: { AAPL: 'USD' },
      baseCurrency: 'USD',
      endDate: '2026-03-06',
    });
    expect(missing).toEqual([]);
    expect(points.map((p) => p.date)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-06']);
    expect(points.map((p) => p.value)).toEqual([1000, 1100, 2100, 2400]);
    // Day 1: bought at 98, closed at 100 → +20
    expect(points[0]!.dayGain).toBeCloseTo(20);
    expect(points[1]!.dayGain).toBeCloseTo(100);
    // Day 3: 10 shares fell 5 (−50) and 10 new shares bought at 104 closed at 105 (+10)
    expect(points[2]!.dayGain).toBeCloseTo(-40);
    expect(points[3]!.dayGain).toBeCloseTo(300);
    expect(points[3]!.invested).toBeCloseTo(2020);

    const total = points.reduce((s, p) => s + p.dayGain, 0);
    const summary = summarize(points);
    expect(summary.totalGain).toBeCloseTo(total);
    expect(summary.totalGain).toBeCloseTo(380);
    expect(periodGain(points, '2026-03')).toBeCloseTo(380);
  });

  it('treats a sell as cash out, not a loss', () => {
    const { points } = buildDailySeries({
      transactions: [
        tx({ symbol: 'AAPL', date: '2026-03-02', quantity: 10, price: 100 }),
        tx({ symbol: 'AAPL', date: '2026-03-03', type: 'SELL', quantity: 10, price: 110 }),
      ],
      prices,
      fx: {},
      currencies: {},
      baseCurrency: 'USD',
      endDate: '2026-03-06',
    });
    expect(points[1]!.value).toBe(0);
    expect(points[1]!.dayGain).toBeCloseTo(100);
    expect(points[2]!.dayGain).toBeCloseTo(0);
    expect(summarize(points).totalGain).toBeCloseTo(100);
  });

  it('converts quote currency to base with forward-filled FX and minor units', () => {
    const { points } = buildDailySeries({
      transactions: [
        tx({ symbol: 'AAPL', date: '2026-03-02', quantity: 1, price: 100 }),
        tx({ symbol: 'VOD', exchange: 'LSE', date: '2026-03-02', quantity: 100, price: 70 }),
      ],
      prices: { ...prices, 'VOD:LSE': [{ date: '2026-03-02', close: 70 }] },
      fx: {
        'USD/EUR': [{ date: '2026-03-01', close: 0.9 }],
        'GBP/EUR': [{ date: '2026-03-02', close: 1.2 }],
      },
      currencies: { AAPL: 'USD', 'VOD:LSE': 'GBp' },
      baseCurrency: 'EUR',
      endDate: '2026-03-02',
    });
    // 100 USD * 0.9 + 100 * 70p * 1.2 = 90 + 84
    expect(points[0]!.value).toBeCloseTo(174);
  });

  it('falls back to trade price and reports missing data', () => {
    const { points, missing } = buildDailySeries({
      transactions: [tx({ symbol: 'NEW', date: '2026-03-02', quantity: 2, price: 50 })],
      prices: {},
      fx: {},
      currencies: { NEW: 'USD' },
      baseCurrency: 'EUR',
      endDate: '2026-03-02',
    });
    expect(points[0]!.value).toBe(100);
    expect(missing.sort()).toEqual(['NEW', 'USD/EUR']);
  });

  it('ignores future trades', () => {
    const { points } = buildDailySeries({
      transactions: [tx({ symbol: 'AAPL', date: '2026-12-01' })],
      prices,
      fx: {},
      currencies: {},
      baseCurrency: 'USD',
      endDate: '2026-03-06',
    });
    expect(points).toEqual([]);
  });
});

describe('mergeBars', () => {
  it('prefers incoming bars and sorts ascending', () => {
    expect(
      mergeBars(
        [
          { date: '2026-01-03', close: 2 },
          { date: '2026-01-01', close: 1 },
        ],
        [{ date: '2026-01-03', close: 3 }],
      ),
    ).toEqual([
      { date: '2026-01-01', close: 1 },
      { date: '2026-01-03', close: 3 },
    ]);
  });
});

describe('normalizeCurrency', () => {
  it('maps minor units', () => {
    expect(normalizeCurrency('GBp')).toEqual({ code: 'GBP', factor: 0.01 });
    expect(normalizeCurrency('usd')).toEqual({ code: 'USD', factor: 1 });
  });
});
