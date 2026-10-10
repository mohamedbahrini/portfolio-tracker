import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { todayLocal } from '@/domain/dates';
import { buildDailySeries, computePositions, summarize } from '@/domain/portfolio';
import type { DailyPoint, ISODate, InstrumentKey, Position } from '@/domain/types';
import { usePortfolioStore } from '@/store/portfolioStore';
import { usePriceStore } from '@/store/priceStore';
import { useSettingsStore } from '@/store/settingsStore';

/** Today's local date, refreshed when the app returns to the foreground. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayLocal);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayLocal());
    });
    return () => sub.remove();
  }, []);
  return today;
}

/** Quote currency per instrument: synced data first, then what was learned when adding trades. */
export function useCurrencies(): Record<InstrumentKey, string> {
  const synced = usePriceStore((s) => s.currencies);
  const instruments = usePortfolioStore((s) => s.instruments);
  return useMemo(() => {
    const merged: Record<InstrumentKey, string> = {};
    for (const [key, inst] of Object.entries(instruments)) merged[key] = inst.currency;
    return { ...merged, ...synced };
  }, [synced, instruments]);
}

export interface PortfolioView {
  points: DailyPoint[];
  byDate: Map<ISODate, DailyPoint>;
  summary: ReturnType<typeof summarize>;
  positions: Position[];
  missing: string[];
  baseCurrency: string;
  currencies: Record<InstrumentKey, string>;
}

/** Single source of derived portfolio data for all screens. Memoized on its inputs. */
export function usePortfolio(): PortfolioView {
  const transactions = usePortfolioStore((s) => s.transactions);
  const prices = usePriceStore((s) => s.prices);
  const fx = usePriceStore((s) => s.fx);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);
  const currencies = useCurrencies();
  const today = useToday();

  return useMemo(() => {
    const { points, missing } = buildDailySeries({
      transactions,
      prices,
      fx,
      currencies,
      baseCurrency,
      endDate: today,
    });
    return {
      points,
      byDate: new Map(points.map((p) => [p.date, p])),
      summary: summarize(points),
      positions: computePositions(transactions).filter((p) => p.quantity > 0),
      missing,
      baseCurrency,
      currencies,
    };
  }, [transactions, prices, fx, currencies, baseCurrency, today]);
}
