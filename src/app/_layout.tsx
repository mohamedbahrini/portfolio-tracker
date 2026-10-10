import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useHydration } from '@/hooks/useHydration';
import { usePortfolioStore } from '@/store/portfolioStore';
import { usePriceStore } from '@/store/priceStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme';

const AUTO_SYNC_AFTER_MS = 15 * 60_000;

/** Refreshes prices on launch and when returning to the app, if data is stale. */
function useAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const maybeSync = () => {
      const { lastSyncAt, sync } = usePriceStore.getState();
      const hasKey = !!useSettingsStore.getState().apiKey;
      const hasTrades = usePortfolioStore.getState().transactions.length > 0;
      if (hasKey && hasTrades && (!lastSyncAt || Date.now() - lastSyncAt > AUTO_SYNC_AFTER_MS)) void sync();
    };
    maybeSync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && maybeSync());
    return () => sub.remove();
  }, [enabled]);
}

export default function RootLayout() {
  const t = useTheme();
  const ready = useHydration();
  useAutoSync(ready);

  const navTheme = t.dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...navTheme,
    colors: {
      ...navTheme.colors,
      background: t.colors.background,
      card: t.colors.surface,
      text: t.colors.text,
      border: t.colors.border,
      primary: t.colors.accent,
    },
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="transaction/new" options={{ title: 'Add trade', presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
