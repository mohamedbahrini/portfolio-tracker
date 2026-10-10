import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AppText, Button, Card, EmptyState, Row, ScreenScroll } from '@/components/ui';
import { instrumentKey, sortTransactions } from '@/domain/portfolio';
import type { Transaction } from '@/domain/types';
import { usePortfolio } from '@/hooks/usePortfolio';
import { usePortfolioStore } from '@/store/portfolioStore';
import { signColor, useTheme } from '@/theme';
import { formatMoney, formatPercent, formatQuantity, formatShortDate, formatSignedMoney } from '@/utils/format';

/** True if removing `id` would leave a later sell without enough shares. */
function breaksHistory(transactions: readonly Transaction[], id: string): boolean {
  const target = transactions.find((t) => t.id === id);
  if (!target || target.type === 'SELL') return false;
  const key = instrumentKey(target.symbol, target.exchange);
  let qty = 0;
  for (const tx of sortTransactions(transactions)) {
    if (tx.id === id || instrumentKey(tx.symbol, tx.exchange) !== key) continue;
    qty += tx.type === 'BUY' ? tx.quantity : -tx.quantity;
    if (qty < -1e-9) return true;
  }
  return false;
}

export default function HoldingsScreen() {
  const t = useTheme();
  const { positions, points, currencies, baseCurrency } = usePortfolio();
  const transactions = usePortfolioStore((s) => s.transactions);
  const instruments = usePortfolioStore((s) => s.instruments);
  const removeTransaction = usePortfolioStore((s) => s.removeTransaction);

  const lastByKey = useMemo(() => {
    const last = points[points.length - 1];
    return new Map(last?.holdings.map((h) => [h.key, h]) ?? []);
  }, [points]);

  const history = useMemo(() => sortTransactions(transactions).reverse(), [transactions]);

  const confirmDelete = (tx: Transaction) => {
    const warning = breaksHistory(transactions, tx.id)
      ? '\n\nA later sell depends on these shares — delete that sell first.'
      : '';
    if (warning) {
      Alert.alert('Can’t delete this buy', warning.trim());
      return;
    }
    Alert.alert(
      'Delete trade?',
      `${tx.type} ${formatQuantity(tx.quantity)} ${tx.symbol} on ${formatShortDate(tx.date)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeTransaction(tx.id) },
      ],
    );
  };

  if (transactions.length === 0) {
    return (
      <ScreenScroll>
        <EmptyState
          title="No holdings"
          message="Record buys and sells with their date, quantity and price. Gains are computed from these trades."
          action={<Button title="Add a trade" onPress={() => router.push('/transaction/new')} />}
        />
      </ScreenScroll>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll>
        <AppText variant="title">Open positions</AppText>
        {positions.length === 0 ? <AppText muted>All positions are closed.</AppText> : null}
        {positions.map((p) => {
          const live = lastByKey.get(p.key);
          const currency = currencies[p.key] ?? baseCurrency;
          const close = live?.close ?? p.averageCost;
          const unrealized = p.quantity * (close - p.averageCost);
          const pct = p.averageCost > 0 ? close / p.averageCost - 1 : 0;
          return (
            <Card key={p.key} style={{ gap: t.space.sm }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <AppText variant="title">{p.key}</AppText>
                  {instruments[p.key]?.name ? (
                    <AppText variant="caption" muted numberOfLines={1}>
                      {instruments[p.key]!.name}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="title">{formatMoney(live?.value ?? 0, baseCurrency)}</AppText>
              </Row>
              <Row>
                <Metric label="Quantity" value={formatQuantity(p.quantity)} />
                <Metric label="Avg cost" value={formatMoney(p.averageCost, currency)} />
                <Metric label="Last" value={formatMoney(close, currency)} />
              </Row>
              <Row>
                <AppText variant="caption" muted>
                  Unrealized
                </AppText>
                <AppText variant="label" color={signColor(t, unrealized)}>
                  {formatSignedMoney(unrealized, currency)} ({formatPercent(pct)})
                </AppText>
              </Row>
              {Math.abs(p.realizedGain) > 0.005 ? (
                <Row>
                  <AppText variant="caption" muted>
                    Realized
                  </AppText>
                  <AppText variant="label" color={signColor(t, p.realizedGain)}>
                    {formatSignedMoney(p.realizedGain, currency)}
                  </AppText>
                </Row>
              ) : null}
            </Card>
          );
        })}

        <AppText variant="title" style={{ marginTop: t.space.md }}>
          Trades
        </AppText>
        <Card style={{ padding: 0 }}>
          {history.map((tx, i) => (
            <Pressable
              key={tx.id}
              onLongPress={() => confirmDelete(tx)}
              accessibilityHint="Long press to delete"
              style={({ pressed }) => ({
                padding: t.space.md,
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderColor: t.colors.border,
                backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
              })}
            >
              <Row>
                <Row style={{ gap: t.space.sm }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: t.radius.pill,
                      backgroundColor: tx.type === 'BUY' ? t.colors.gainSoft : t.colors.lossSoft,
                    }}
                  >
                    <AppText variant="caption" color={tx.type === 'BUY' ? t.colors.gain : t.colors.loss} style={{ fontWeight: '700' }}>
                      {tx.type}
                    </AppText>
                  </View>
                  <View>
                    <AppText variant="label">{instrumentKey(tx.symbol, tx.exchange)}</AppText>
                    <AppText variant="caption" muted>
                      {formatShortDate(tx.date)}
                    </AppText>
                  </View>
                </Row>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="label">
                    {formatQuantity(tx.quantity)} × {tx.price.toFixed(2)}
                  </AppText>
                  {tx.fee > 0 ? (
                    <AppText variant="caption" muted>
                      fee {tx.fee.toFixed(2)}
                    </AppText>
                  ) : null}
                </View>
              </Row>
            </Pressable>
          ))}
        </Card>
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>
          Long-press a trade to delete it
        </AppText>
      </ScreenScroll>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add trade"
        onPress={() => router.push('/transaction/new')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: t.space.lg,
          bottom: t.space.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.colors.accent,
          opacity: pressed ? 0.85 : 1,
          elevation: 4,
        })}
      >
        <Ionicons name="add" size={28} color={t.colors.onAccent} />
      </Pressable>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}
