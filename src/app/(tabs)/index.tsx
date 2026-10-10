import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { LineChart } from '@/components/LineChart';
import { SyncStatus } from '@/components/SyncStatus';
import { AppText, Button, Card, EmptyState, GainText, Row, ScreenScroll } from '@/components/ui';
import { usePortfolio, useToday } from '@/hooks/usePortfolio';
import { usePortfolioStore } from '@/store/portfolioStore';
import { usePriceStore } from '@/store/priceStore';
import { useSettingsStore } from '@/store/settingsStore';
import { signColor, useTheme } from '@/theme';
import { formatMoney, formatPercent, formatShortDate } from '@/utils/format';

export default function OverviewScreen() {
  const t = useTheme();
  const { points, summary, baseCurrency } = usePortfolio();
  const today = useToday();
  const hasKey = useSettingsStore((s) => !!s.apiKey);
  const syncing = usePriceStore((s) => s.status.kind === 'syncing');
  const sync = usePriceStore((s) => s.sync);
  const instruments = usePortfolioStore((s) => s.instruments);

  const recent = useMemo(() => points.slice(-30).map((p) => p.value), [points]);
  const holdings = useMemo(() => {
    const last = points[points.length - 1];
    if (!last) return [];
    return last.holdings.filter((h) => h.quantity > 0).sort((a, b) => b.value - a.value);
  }, [points]);

  const refresh = <RefreshControl refreshing={syncing} onRefresh={sync} tintColor={t.colors.accent} colors={[t.colors.accent]} />;

  if (!hasKey) {
    return (
      <ScreenScroll>
        <EmptyState
          title="Connect Twelve Data"
          message="Prices come from the Twelve Data API. Create a free key at twelvedata.com and paste it in Settings."
          action={<Button title="Open Settings" onPress={() => router.push('/settings')} />}
        />
      </ScreenScroll>
    );
  }

  if (points.length === 0) {
    return (
      <ScreenScroll refreshControl={refresh}>
        <EmptyState
          title="No trades yet"
          message="Add your first buy to start tracking value, daily gains and history."
          action={<Button title="Add a trade" onPress={() => router.push('/transaction/new')} />}
        />
      </ScreenScroll>
    );
  }

  const trend = recent.length > 1 ? recent[recent.length - 1]! - recent[0]! : 0;

  return (
    <ScreenScroll refreshControl={refresh}>
      <Card style={{ gap: t.space.sm }}>
        <AppText variant="label" muted>
          Portfolio value
        </AppText>
        <AppText variant="hero">{formatMoney(summary.value, baseCurrency)}</AppText>
        <Row style={{ justifyContent: 'flex-start', gap: t.space.sm }}>
          <GainText value={summary.dayGain} pct={summary.dayGainPct} currency={baseCurrency} />
          <AppText variant="caption" muted>
            {summary.asOf === today ? 'today' : summary.asOf ? `last close · ${formatShortDate(summary.asOf)}` : ''}
          </AppText>
        </Row>
        <View style={{ marginTop: t.space.sm, marginHorizontal: -t.space.xs }}>
          <LineChart series={[{ values: recent, color: signColor(t, trend), fill: true }]} height={90} />
        </View>
        <AppText variant="caption" muted>
          Last 30 market days
        </AppText>
      </Card>

      <Row style={{ gap: t.space.md }}>
        <Card style={{ flex: 1, gap: t.space.xs }}>
          <AppText variant="label" muted>
            Total gain
          </AppText>
          <AppText variant="title" color={signColor(t, summary.totalGain)}>
            {formatMoney(summary.totalGain, baseCurrency, 0)}
          </AppText>
          <AppText variant="caption" color={signColor(t, summary.totalGain)}>
            {formatPercent(summary.totalGainPct)}
          </AppText>
        </Card>
        <Card style={{ flex: 1, gap: t.space.xs }}>
          <AppText variant="label" muted>
            Net invested
          </AppText>
          <AppText variant="title">{formatMoney(summary.invested, baseCurrency, 0)}</AppText>
          <AppText variant="caption" muted>
            buys − sells
          </AppText>
        </Card>
      </Row>

      <Card style={{ gap: t.space.md }}>
        <AppText variant="title">Allocation</AppText>
        {holdings.map((h) => {
          const weight = summary.value > 0 ? h.value / summary.value : 0;
          return (
            <View key={h.key} style={{ gap: 6 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{h.key}</AppText>
                  {instruments[h.key]?.name ? (
                    <AppText variant="caption" muted numberOfLines={1}>
                      {instruments[h.key]!.name}
                    </AppText>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="label">{formatMoney(h.value, baseCurrency)}</AppText>
                  <AppText variant="caption" color={signColor(t, h.dayGain)}>
                    {formatPercent(weight, 1).replace('+', '')} · today {formatMoney(h.dayGain, baseCurrency)}
                  </AppText>
                </View>
              </Row>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceAlt }}>
                <View
                  style={{ height: 4, borderRadius: 2, width: `${Math.round(weight * 100)}%`, backgroundColor: t.colors.accent }}
                />
              </View>
            </View>
          );
        })}
      </Card>

      <SyncStatus />
    </ScreenScroll>
  );
}
