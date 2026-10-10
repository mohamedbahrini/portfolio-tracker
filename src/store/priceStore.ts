import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TwelveDataError, createTwelveDataClient } from '@/api/twelveData';
import type { InstrumentKey, PriceTable } from '@/domain/types';
import { syncPrices, type SyncProgress } from '@/services/priceSync';
import { usePortfolioStore } from './portfolioStore';
import { useSettingsStore } from './settingsStore';
import { jsonStorage } from './storage';

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; progress?: SyncProgress }
  | { kind: 'error'; message: string };

interface PriceState {
  prices: PriceTable;
  fx: PriceTable;
  currencies: Record<InstrumentKey, string>;
  lastSyncAt: number | null;
  /** Non-fatal per-symbol problems from the last sync. */
  warnings: string[];
  status: SyncStatus;
  sync: () => Promise<void>;
  clearCache: () => void;
}

export const usePriceStore = create<PriceState>()(
  persist(
    (set, get) => ({
      prices: {},
      fx: {},
      currencies: {},
      lastSyncAt: null,
      warnings: [],
      status: { kind: 'idle' },

      sync: async () => {
        if (get().status.kind === 'syncing') return;
        const { apiKey, baseCurrency, creditsPerMinute } = useSettingsStore.getState();
        if (!apiKey) {
          set({ status: { kind: 'error', message: 'Add your Twelve Data API key in Settings.' } });
          return;
        }
        const { transactions } = usePortfolioStore.getState();
        set({ status: { kind: 'syncing' } });
        try {
          const api = createTwelveDataClient({ apiKey, creditsPerMinute });
          const { prices, fx, currencies } = get();
          const result = await syncPrices({
            api,
            transactions,
            baseCurrency,
            state: { prices, fx, currencies },
            onProgress: (progress) => set({ status: { kind: 'syncing', progress } }),
          });
          set({
            prices: result.prices,
            fx: result.fx,
            currencies: result.currencies,
            lastSyncAt: Date.now(),
            warnings: result.errors.map((e) => `${e.item}: ${e.message}`),
            status: { kind: 'idle' },
          });
        } catch (err) {
          const message =
            err instanceof TwelveDataError && err.isAuth
              ? 'Twelve Data rejected the API key. Check it in Settings.'
              : err instanceof Error
                ? err.message
                : 'Price update failed';
          set({ status: { kind: 'error', message } });
        }
      },

      clearCache: () => set({ prices: {}, fx: {}, currencies: {}, lastSyncAt: null, warnings: [] }),
    }),
    {
      name: 'prices',
      version: 1,
      storage: jsonStorage,
      partialize: ({ prices, fx, currencies, lastSyncAt, warnings }) => ({
        prices,
        fx,
        currencies,
        lastSyncAt,
        warnings,
      }),
    },
  ),
);
