import { useEffect, useState } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { usePriceStore } from '@/store/priceStore';
import { useSettingsStore } from '@/store/settingsStore';

const stores = [usePortfolioStore, usePriceStore, useSettingsStore] as const;

/** True once every persisted store has loaded from disk and the API key has been read. */
export function useHydration(): boolean {
  const [ready, setReady] = useState(() => stores.every((s) => s.persist.hasHydrated()));
  const apiKeyLoaded = useSettingsStore((s) => s.apiKeyLoaded);

  useEffect(() => {
    void useSettingsStore.getState().loadApiKey();
    const check = () => setReady(stores.every((s) => s.persist.hasHydrated()));
    const unsubs = stores.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
  }, []);

  return ready && apiKeyLoaded;
}
