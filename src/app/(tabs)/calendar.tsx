import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { MonthCalendar } from '@/components/MonthCalendar';
import { AppText, Card, EmptyState, GainText, Row, ScreenScroll } from '@/components/ui';
import { monthKey, monthOf, shiftMonth, type MonthRef } from '@/domain/dates';
import type { ISODate } from '@/domain/types';
import { usePortfolio, useToday } from '@/hooks/usePortfolio';
import { usePriceStore } from '@/store/priceStore';
import { signColor, useTheme } from '@/theme';
import { formatDay, formatMoney, formatMonth, formatPercent, formatQuantity, formatSignedMoney } from '@/utils/format';

export default function CalendarScreen() {
  const t = useTheme();
  const today = useToday();
  const { points, byDate, baseCurrency } = usePortfolio();
  const syncing = usePriceStore((s) => s.status.kind === 'syncing');
  const sync = usePriceStore((s) => s.sync);

  const [month, setMonth] = useState<MonthRef>(() => monthOf(today));
  const [selected, setSelected] = useState<ISODate | null>(() => points[points.length - 1]?.date ?? null);

  const stats = useMemo(() => {
    const prefix = monthKey(month);
    const inMonth = points.filter((p) => p.date.startsWith(prefix));
    if (inMonth.length === 0) return null;
    const first = inMonth[0]!;
    const previous = points[points.indexOf(first) - 1];
    // Return is measured against the value carried into the month (or the first deposit for a new portfolio).
    const basis = previous && previous.value > 0 ? previous.value : first.invested;
    const startValue = basis;
    const total = inMonth.reduce((s, p) => s + p.dayGain, 0);
    const best = inMonth.reduce((a, b) => (b.dayGain > a.dayGain ? b : a));
    const worst = inMonth.reduce((a, b) => (b.dayGain < a.dayGain ? b : a));
    return {
      total,
      pct: startValue > 0 ? total / startValue : 0,
      up: inMonth.filter((p) => p.dayGain > 0.005).length,
      down: inMonth.filter((p) => p.dayGain < -0.005).length,
      best,
      worst,
    };
  }, [points, month]);

  const firstMonth = points[0] ? monthOf(points[0].date) : monthOf(today);
  const thisMonth = monthOf(today);
  const canBack = monthKey(month) > monthKey(firstMonth);
  const canForward = monthKey(month) < monthKey(thisMonth);
  const day = selected ? byDate.get(selected) : undefined;

  if (points.length === 0) {
    return (
      <ScreenScroll>
        <EmptyState title="Nothing to show yet" message="Daily gains appear here once you add trades and prices load." />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} tintColor={t.colors.accent} colors={[t.colors.accent]} />}
    >
      <Card style={{ gap: t.space.md }}>
        <Row>
          <Pressable
            accessibilityLabel="Previous month"
            disabled={!canBack}
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            hitSlop={12}
            style={{ opacity: canBack ? 1 : 0.3 }}
          >
            <Ionicons name="chevron-back" size={22} color={t.colors.text} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <AppText variant="title">{formatMonth(month.year, month.month)}</AppText>
            {stats ? <GainText value={stats.total} pct={stats.pct} currency={baseCurrency} variant="label" /> : null}
          </View>
          <Pressable
            accessibilityLabel="Next month"
            disabled={!canForward}
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            hitSlop={12}
            style={{ opacity: canForward ? 1 : 0.3 }}
          >
            <Ionicons name="chevron-forward" size={22} color={t.colors.text} />
          </Pressable>
        </Row>

        <MonthCalendar month={month} byDate={byDate} selected={selected} today={today} onSelect={setSelected} />

        {stats ? (
          <Row style={{ marginTop: t.space.xs }}>
            <Stat label="Up days" value={String(stats.up)} color={t.colors.gain} />
            <Stat label="Down days" value={String(stats.down)} color={t.colors.loss} />
            <Stat label="Best" value={formatSignedMoney(stats.best.dayGain, baseCurrency, 0)} color={signColor(t, stats.best.dayGain)} />
            <Stat label="Worst" value={formatSignedMoney(stats.worst.dayGain, baseCurrency, 0)} color={signColor(t, stats.worst.dayGain)} />
          </Row>
        ) : (
          <AppText muted style={{ textAlign: 'center' }}>
            No market days with holdings this month.
          </AppText>
        )}
      </Card>

      {selected ? (
        <Card style={{ gap: t.space.md }}>
          <AppText variant="label" muted>
            {formatDay(selected)}
          </AppText>
          {day ? (
            <>
              <Row>
                <View>
                  <AppText variant="caption" muted>
                    Day gain
                  </AppText>
                  <GainText value={day.dayGain} pct={day.dayGainPct} currency={baseCurrency} variant="title" />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="caption" muted>
                    Closing value
                  </AppText>
                  <AppText variant="title">{formatMoney(day.value, baseCurrency)}</AppText>
                </View>
              </Row>
              <View style={{ gap: t.space.sm }}>
                {[...day.holdings]
                  .sort((a, b) => Math.abs(b.dayGain) - Math.abs(a.dayGain))
                  .map((h) => (
                    <Row key={h.key}>
                      <View>
                        <AppText variant="label">{h.key}</AppText>
                        <AppText variant="caption" muted>
                          {formatQuantity(h.quantity)} × {h.close.toFixed(2)}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="label" color={signColor(t, h.dayGain)}>
                          {formatSignedMoney(h.dayGain, baseCurrency)}
                        </AppText>
                        <AppText variant="caption" muted>
                          {formatMoney(h.value, baseCurrency)}
                        </AppText>
                      </View>
                    </Row>
                  ))}
              </View>
              {day.dayGainPct !== 0 ? (
                <AppText variant="caption" muted>
                  Return on capital at work: {formatPercent(day.dayGainPct)}. Buys and sells are excluded from gains.
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText muted>No trading on this day.</AppText>
          )}
        </Card>
      ) : null}
    </ScreenScroll>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <AppText variant="label" color={color} numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}
