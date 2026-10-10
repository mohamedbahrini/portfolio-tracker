import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { monthGrid, type MonthRef } from '@/domain/dates';
import type { DailyPoint, ISODate } from '@/domain/types';
import { signColor, useTheme } from '@/theme';
import { formatCompactSigned } from '@/utils/format';
import { AppText } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  month: MonthRef;
  byDate: ReadonlyMap<ISODate, DailyPoint>;
  selected: ISODate | null;
  today: ISODate;
  onSelect: (date: ISODate) => void;
}

function MonthCalendarImpl({ month, byDate, selected, today, onSelect }: Props) {
  const t = useTheme();
  const weeks = useMemo(() => monthGrid(month), [month]);

  // Scale cell tint by the month's biggest move so colors stay meaningful.
  const maxAbs = useMemo(() => {
    let m = 0;
    for (const week of weeks) {
      for (const d of week) {
        const p = d ? byDate.get(d) : undefined;
        if (p) m = Math.max(m, Math.abs(p.dayGain));
      }
    }
    return m;
  }, [weeks, byDate]);

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        {WEEKDAYS.map((d) => (
          <View key={d} style={styles.headerCell}>
            <AppText variant="caption" muted>
              {d}
            </AppText>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={styles.cell} />;
            const point = byDate.get(date);
            const gain = point?.dayGain ?? 0;
            const hasMove = !!point && Math.abs(gain) >= 0.005;
            const intensity = hasMove && maxAbs > 0 ? 0.12 + 0.5 * (Math.abs(gain) / maxAbs) : 0;
            const isSelected = date === selected;
            const isFuture = date > today;
            const tint = gain >= 0 ? '43, 211, 138' : '255, 92, 108';
            return (
              <Pressable
                key={date}
                onPress={() => onSelect(date)}
                disabled={isFuture}
                accessibilityRole="button"
                accessibilityLabel={`${date}${point ? `, ${formatCompactSigned(gain)}` : ', no trading'}`}
                style={[
                  styles.cell,
                  {
                    borderRadius: t.radius.sm,
                    backgroundColor: hasMove ? `rgba(${tint}, ${intensity.toFixed(2)})` : t.colors.surfaceAlt,
                    borderWidth: isSelected ? 2 : date === today ? 1 : 0,
                    borderColor: isSelected ? t.colors.accent : t.colors.textMuted,
                    opacity: isFuture ? 0.35 : 1,
                  },
                ]}
              >
                <AppText variant="caption" muted={!point} style={{ fontWeight: '600' }}>
                  {Number(date.slice(8))}
                </AppText>
                {point ? (
                  <AppText
                    variant="caption"
                    color={hasMove ? signColor(t, gain) : t.colors.textMuted}
                    style={{ fontSize: 10, fontWeight: '700' }}
                    numberOfLines={1}
                  >
                    {hasMove ? formatCompactSigned(gain) : '0'}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const MonthCalendar = memo(MonthCalendarImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  headerCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 0.82, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 1 },
});
