import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiKeyStorage, jsonStorage } from './storage';

export const SUPPORTED_BASE_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const;

interface SettingsState {
  baseCurrency: string;
  /** Twelve Data credits per minute for the user's plan. */
  creditsPerMinute: number;
  /** Held in memory only; persisted separately in the secure store. */
  apiKey: string | null;
  apiKeyLoaded: boolean;
  setBaseCurrency: (currency: string) => void;
  setCreditsPerMinute: (value: number) => void;
  loadApiKey: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseCurrency: 'EUR',
      creditsPerMinute: 8,
      apiKey: null,
      apiKeyLoaded: false,
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setCreditsPerMinute: (value) => set({ creditsPerMinute: Math.max(1, Math.min(600, Math.round(value))) }),
      loadApiKey: async () => {
        const apiKey = await apiKeyStorage.get().catch(() => null);
        set({ apiKey, apiKeyLoaded: true });
      },
      saveApiKey: async (key) => {
        await apiKeyStorage.set(key);
        set({ apiKey: key.trim() });
      },
      clearApiKey: async () => {
        await apiKeyStorage.clear();
        set({ apiKey: null });
      },
    }),
    {
      name: 'settings',
      version: 1,
      storage: jsonStorage,
      partialize: ({ baseCurrency, creditsPerMinute }) => ({ baseCurrency, creditsPerMinute }),
    },
  ),
);
