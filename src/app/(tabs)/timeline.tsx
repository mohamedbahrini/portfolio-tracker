import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { LineChart } from '@/components/LineChart';
import { AppText, Card, EmptyState, GainText, Row, ScreenScroll, Segmented } from '@/components/ui';
import { addMonths, monthOf } from '@/domain/dates';
import { usePortfolio, useToday } from '@/hooks/usePortfolio';
import { usePriceStore } from '@/store/priceStore';
import { signColor, useTheme } from '@/theme';
import { formatDay, formatMonth, formatMoney, formatShortDate, formatSignedMoney } from '@/utils/format';

const RANGES = [
  { label: '1M', value: '1M', months: 1 },
  { label: '3M', value: '3M', months: 3 },
  { label: '6M', value: '6M', months: 6 },
  { label: '1Y', value: '1Y', months: 12 },
  { label: 'All', value: 'ALL', months: 0 },
] as const;
type Range = (typeof RANGES)[number]['value'];

export default function TimelineScreen() {
  const t = useTheme();
  const today = useToday();
  const { points, baseCurrency } = usePortfolio();
  const syncing = usePriceStore((s) => s.status.kind === 'syncing');
  const sync = usePriceStore((s) => s.sync);
  const [range, setRange] = useState<Range>('3M');
  const [scrub, setScrub] = useState<number | null>(null);

  const visible = useMemo(() => {
    const months = RANGES.find((r) => r.value === range)!.months;
    if (months === 0) return points;
    const from = addMonths(today, -months);
    return points.filter((p) => p.date >= from);
  }, [points, range, today]);

  const series = useMemo(
    () => {
      const gain = visible.reduce((s, p) => s + p.dayGain, 0);
      return [
        { values: visible.map((p) => p.value), color: signColor(t, gain), fill: true },
        { values: visible.map((p) => p.invested), color: t.colors.invested, dashed: true },
      ];
    },
    [visible, t],
  );

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      const key = p.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + p.dayGain);
    }
    return [...map.entries()].reverse().slice(0, 12);
  }, [points]);

  if (points.length < 2) {
    return (
      <ScreenScroll>
        <EmptyState title="Not enough history" message="The timeline fills in as prices load for your trades." />
      </ScreenScroll>
    );
  }

  const focus = scrub !== null ? visible[scrub] : visible[visible.length - 1];
  const rangeGain = visible.reduce((s, p) => s + p.dayGain, 0);
  const maxMonthly = Math.max(1, ...monthly.map(([, v]) => Math.abs(v)));

  return (
    <ScreenScroll
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} tintColor={t.colors.accent} colors={[t.colors.accent]} />}
    >
      <Card style={{ gap: t.space.md }}>
        <View style={{ gap: 2 }}>
          <AppText variant="label" muted>
            {focus ? formatDay(focus.date) : ''}
          </AppText>
          <AppText variant="hero">{formatMoney(focus?.value ?? 0, baseCurrency)}</AppText>
          {scrub !== null && focus ? (
            <AppText variant="caption" muted>
              Invested {formatMoney(focus.invested, baseCurrency, 0)} · day {formatSignedMoney(focus.dayGain, baseCurrency)}
            </AppText>
          ) : (
            <Row style={{ justifyContent: 'flex-start', gap: t.space.sm }}>
              <GainText value={rangeGain} currency={baseCurrency} variant="label" />
              <AppText variant="caption" muted>
                market gain over {range === 'ALL' ? 'all time' : range}
              </AppText>
            </Row>
          )}
        </View>

        <LineChart series={series} height={240} onScrub={setScrub} />

        <Row>
          <AppText variant="caption" muted>
            {visible[0] ? formatShortDate(visible[0].date) : ''}
          </AppText>
          <Row style={{ gap: t.space.md }}>
            <Legend color={series[0]!.color} label="Value" />
            <Legend color={t.colors.invested} label="Invested" dashed />
          </Row>
          <AppText variant="caption" muted>
            {visible.length ? formatShortDate(visible[visible.length - 1]!.date) : ''}
          </AppText>
        </Row>

        <Segmented options={RANGES} value={range} onChange={setRange} />
      </Card>

      <Card style={{ gap: t.space.md }}>
        <AppText variant="title">Monthly gains</AppText>
        {monthly.map(([key, value]) => {
          const { year, month } = monthOf(`${key}-01`);
          return (
            <View key={key} style={{ gap: 4 }}>
              <Row>
                <AppText variant="label">{formatMonth(year, month)}</AppText>
                <AppText variant="label" color={signColor(t, value)}>
                  {formatSignedMoney(value, baseCurrency)}
                </AppText>
              </Row>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceAlt }}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.max(2, Math.round((Math.abs(value) / maxMonthly) * 100))}%`,
                    backgroundColor: signColor(t, value),
                  }}
                />
              </View>
            </View>
          );
        })}
      </Card>
    </ScreenScroll>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Row style={{ gap: 6 }}>
      <View
        style={{
          width: 14,
          height: 0,
          borderTopWidth: 2,
          borderColor: color,
          borderStyle: dashed ? 'dashed' : 'solid',
        }}
      />
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </Row>
  );
}
