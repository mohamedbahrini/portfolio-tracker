import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { TwelveDataError, createTwelveDataClient } from '@/api/twelveData';
import { AppText, Button, Field, ScreenScroll, Segmented } from '@/components/ui';
import { addDays, isoToLocalDate, localDateToISO } from '@/domain/dates';
import { instrumentKey } from '@/domain/portfolio';
import type { TransactionType } from '@/domain/types';
import { validateTransaction, type DraftErrors, type TransactionDraft } from '@/domain/validation';
import { useToday } from '@/hooks/usePortfolio';
import { usePortfolioStore } from '@/store/portfolioStore';
import { usePriceStore } from '@/store/priceStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme';
import { formatDay } from '@/utils/format';

const TYPES = [
  { label: 'Buy', value: 'BUY' },
  { label: 'Sell', value: 'SELL' },
] as const satisfies readonly { label: string; value: TransactionType }[];

export default function NewTransactionScreen() {
  const t = useTheme();
  const today = useToday();
  const apiKey = useSettingsStore((s) => s.apiKey);
  const creditsPerMinute = useSettingsStore((s) => s.creditsPerMinute);
  const transactions = usePortfolioStore((s) => s.transactions);
  const instruments = usePortfolioStore((s) => s.instruments);
  const addTransaction = usePortfolioStore((s) => s.addTransaction);
  const upsertInstrument = usePortfolioStore((s) => s.upsertInstrument);

  const [draft, setDraft] = useState<TransactionDraft>({
    type: 'BUY',
    symbol: '',
    exchange: '',
    date: today,
    quantity: '',
    price: '',
    fee: '',
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState<'save' | 'price' | null>(null);
  const [iosPicker, setIosPicker] = useState(false);
  const [info, setInfo] = useState<string>();

  const update = <K extends keyof TransactionDraft>(key: K, value: TransactionDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const openDatePicker = () => {
    const value = isoToLocalDate(draft.date);
    const maximumDate = isoToLocalDate(today);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        maximumDate,
        onValueChange: (_e, date) => update('date', localDateToISO(date)),
      });
    } else {
      setIosPicker(true);
    }
  };

  const client = () => (apiKey ? createTwelveDataClient({ apiKey, creditsPerMinute, maxRetries: 0 }) : null);

  /** Fills the price with the instrument's close on (or just before) the chosen date. */
  const fillClosePrice = async () => {
    const api = client();
    if (!api || !draft.symbol.trim()) {
      setErrors((e) => ({ ...e, symbol: draft.symbol.trim() ? undefined : 'Enter a symbol first' }));
      return;
    }
    setBusy('price');
    try {
      const series = await api.getDailySeries(
        { symbol: draft.symbol.trim().toUpperCase(), exchange: draft.exchange.trim() || undefined },
        addDays(draft.date, -7),
      );
      const bar = [...series.bars].reverse().find((b) => b.date <= draft.date);
      if (bar) {
        update('price', String(bar.close));
        setInfo(`Close on ${formatDay(bar.date)} (${series.currency})`);
      } else {
        setErrors((e) => ({ ...e, price: 'No price found for that date' }));
      }
    } catch (err) {
      setErrors((e) => ({ ...e, symbol: describe(err) }));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const result = validateTransaction(draft, transactions, today);
    setErrors(result.errors);
    if (!result.value) return;

    const key = instrumentKey(result.value.symbol, result.value.exchange);
    const api = client();
    setBusy('save');
    try {
      // Confirm the symbol exists and learn its name/currency the first time we see it.
      if (api && !instruments[key]) {
        const quote = await api.getQuote({ symbol: result.value.symbol, exchange: result.value.exchange });
        upsertInstrument({
          key,
          symbol: result.value.symbol,
          exchange: result.value.exchange,
          name: quote.name,
          currency: quote.currency,
        });
      }
      addTransaction(result.value);
      void usePriceStore.getState().sync();
      router.back();
    } catch (err) {
      setErrors((e) => ({ ...e, symbol: describe(err) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenScroll>
        <Segmented options={TYPES} value={draft.type} onChange={(v) => update('type', v)} />

        <View style={{ flexDirection: 'row', gap: t.space.md }}>
          <View style={{ flex: 3 }}>
            <Field
              label="Symbol"
              value={draft.symbol}
              onChangeText={(v) => update('symbol', v)}
              placeholder="AAPL"
              autoCapitalize="characters"
              autoCorrect={false}
              error={errors.symbol}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Field
              label="Exchange"
              value={draft.exchange}
              onChangeText={(v) => update('exchange', v)}
              placeholder="optional"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
        </View>
        <AppText variant="caption" muted style={{ marginTop: -t.space.sm }}>
          For European listings add the exchange, e.g. SAP + XETR or MC + Euronext.
        </AppText>

        <View style={{ gap: t.space.xs }}>
          <AppText variant="label" muted>
            Date
          </AppText>
          <Pressable
            onPress={openDatePicker}
            accessibilityRole="button"
            style={{
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.surfaceAlt,
              borderWidth: 0.5,
              borderColor: errors.date ? t.colors.loss : t.colors.border,
            }}
          >
            <AppText>{formatDay(draft.date)}</AppText>
          </Pressable>
          {errors.date ? (
            <AppText variant="caption" color={t.colors.loss}>
              {errors.date}
            </AppText>
          ) : null}
          {iosPicker ? (
            <DateTimePicker
              value={isoToLocalDate(draft.date)}
              mode="date"
              display="inline"
              maximumDate={isoToLocalDate(today)}
              onValueChange={(_e, date) => {
                update('date', localDateToISO(date));
                setIosPicker(false);
              }}
              onDismiss={() => setIosPicker(false)}
            />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: t.space.md }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Quantity"
              value={draft.quantity}
              onChangeText={(v) => update('quantity', v)}
              keyboardType="decimal-pad"
              placeholder="10"
              error={errors.quantity}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Price per unit"
              value={draft.price}
              onChangeText={(v) => {
                update('price', v);
                setInfo(undefined);
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errors.price}
              hint={info}
            />
          </View>
        </View>
        {apiKey ? (
          <Button
            title="Use closing price for this date"
            variant="secondary"
            onPress={fillClosePrice}
            loading={busy === 'price'}
            disabled={busy !== null}
          />
        ) : null}

        <Field
          label="Fees"
          value={draft.fee}
          onChangeText={(v) => update('fee', v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          error={errors.fee}
          hint="Prices and fees are in the instrument's trading currency."
        />

        <Button title={draft.type === 'BUY' ? 'Add buy' : 'Add sell'} onPress={save} loading={busy === 'save'} disabled={busy !== null} />
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}

function describe(err: unknown): string {
  if (err instanceof TwelveDataError) {
    if (err.code === 404 || err.code === 400) return 'Symbol not found on Twelve Data';
    if (err.isAuth) return 'API key rejected — check Settings';
    if (err.isRateLimit) return 'Rate limit reached — try again in a minute';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
