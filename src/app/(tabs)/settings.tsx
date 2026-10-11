import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { TwelveDataError, createTwelveDataClient } from '@/api/twelveData';
import { AppText, Button, Card, Field, Row, ScreenScroll } from '@/components/ui';
import { usePriceStore } from '@/store/priceStore';
import { SUPPORTED_BASE_CURRENCIES, useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme';

function mask(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export default function SettingsScreen() {
  const t = useTheme();
  const { apiKey, saveApiKey, clearApiKey, baseCurrency, setBaseCurrency, creditsPerMinute, setCreditsPerMinute } =
    useSettingsStore();
  const sync = usePriceStore((s) => s.sync);
  const clearCache = usePriceStore((s) => s.clearCache);

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [credits, setCredits] = useState(String(creditsPerMinute));

  const onSaveKey = async () => {
    const key = draft.trim();
    if (!key) return;
    setSaving(true);
    setError(undefined);
    try {
      // One credit: confirms the key works before we store it.
      await createTwelveDataClient({ apiKey: key, maxRetries: 0 }).getQuote({ symbol: 'AAPL' });
      await saveApiKey(key);
      setDraft('');
      void sync();
    } catch (err) {
      setError(
        err instanceof TwelveDataError && err.isAuth
          ? 'Twelve Data rejected this key.'
          : err instanceof Error
            ? err.message
            : 'Could not verify the key',
      );
    } finally {
      setSaving(false);
    }
  };

  const onRemoveKey = () =>
    Alert.alert('Remove API key?', 'Prices will stop updating until you add a key again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void clearApiKey() },
    ]);

  const onBaseCurrency = (currency: string) => {
    if (currency === baseCurrency) return;
    setBaseCurrency(currency);
    void sync(); // fetch any FX pairs the new base needs
  };

  const onClearCache = () =>
    Alert.alert('Clear price cache?', 'All price history will be downloaded again on the next refresh.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearCache();
          void sync();
        },
      },
    ]);

  return (
    <ScreenScroll>
      <Card style={{ gap: t.space.md }}>
        <AppText variant="title">Twelve Data API key</AppText>
        {apiKey ? (
          <Row>
            <AppText style={{ fontFamily: 'monospace' }}>{mask(apiKey)}</AppText>
            <Pressable onPress={onRemoveKey} hitSlop={8}>
              <AppText variant="label" color={t.colors.loss}>
                Remove
              </AppText>
            </Pressable>
          </Row>
        ) : (
          <AppText muted>
            Prices are loaded from Twelve Data. The free plan covers 8 symbols per minute and 800 per day.
          </AppText>
        )}
        <Field
          label={apiKey ? 'Replace key' : 'API key'}
          value={draft}
          onChangeText={setDraft}
          placeholder="Paste your key"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          error={error}
          hint="Stored encrypted on this device only."
        />
        <Button title="Verify & save" onPress={onSaveKey} loading={saving} disabled={!draft.trim()} />
        <Pressable onPress={() => void Linking.openURL('https://twelvedata.com/pricing')}>
          <AppText variant="label" color={t.colors.accent}>
            Get a free key at twelvedata.com →
          </AppText>
        </Pressable>
      </Card>

      <Card style={{ gap: t.space.md }}>
        <AppText variant="title">Base currency</AppText>
        <AppText muted>Totals are converted to this currency with daily FX rates.</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
          {SUPPORTED_BASE_CURRENCIES.map((c) => {
            const active = c === baseCurrency;
            return (
              <Pressable
                key={c}
                onPress={() => onBaseCurrency(c)}
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: t.space.lg,
                  paddingVertical: t.space.sm,
                  borderRadius: t.radius.pill,
                  backgroundColor: active ? t.colors.accent : t.colors.surfaceAlt,
                }}
              >
                <AppText variant="label" color={active ? t.colors.onAccent : t.colors.text}>
                  {c}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: t.space.md }}>
        <AppText variant="title">Data</AppText>
        <Field
          label="API credits per minute"
          value={credits}
          onChangeText={setCredits}
          onEndEditing={() => {
            const n = Number(credits);
            if (Number.isFinite(n) && n >= 1) setCreditsPerMinute(n);
            else setCredits(String(creditsPerMinute));
          }}
          keyboardType="number-pad"
          hint="Prices are fetched in batches of this size, one batch per minute. 8 on the free plan."
        />
        <Button title="Clear price cache" variant="danger" onPress={onClearCache} />
      </Card>

      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        Market data by Twelve Data. Values are end-of-day closes; today’s figure updates while markets are open.
      </AppText>
    </ScreenScroll>
  );
}
