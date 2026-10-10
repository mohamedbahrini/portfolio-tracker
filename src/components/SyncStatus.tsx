import { ActivityIndicator, View } from 'react-native';
import { usePriceStore } from '@/store/priceStore';
import { useTheme } from '@/theme';
import { formatRelativeTime } from '@/utils/format';
import { AppText, Card } from './ui';

/** Compact status line: progress while syncing, errors, and per-symbol warnings. */
export function SyncStatus() {
  const t = useTheme();
  const status = usePriceStore((s) => s.status);
  const lastSyncAt = usePriceStore((s) => s.lastSyncAt);
  const warnings = usePriceStore((s) => s.warnings);

  if (status.kind === 'syncing') {
    const p = status.progress;
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md, padding: t.space.md }}>
        <ActivityIndicator color={t.colors.accent} />
        <View style={{ flex: 1 }}>
          <AppText variant="label">Updating prices{p ? ` · ${p.done}/${p.total}` : ''}</AppText>
          <AppText variant="caption" muted>
            {p?.current ? `${p.current} — free plan allows 8 symbols per minute` : 'Contacting Twelve Data…'}
          </AppText>
        </View>
      </Card>
    );
  }

  return (
    <View style={{ gap: t.space.sm }}>
      {status.kind === 'error' ? (
        <Card style={{ backgroundColor: t.colors.lossSoft, borderColor: t.colors.loss, padding: t.space.md }}>
          <AppText variant="label" color={t.colors.loss}>
            {status.message}
          </AppText>
        </Card>
      ) : null}
      {warnings.length > 0 ? (
        <Card style={{ padding: t.space.md, gap: 2 }}>
          <AppText variant="label">Some prices couldn’t be loaded</AppText>
          {warnings.slice(0, 4).map((w) => (
            <AppText key={w} variant="caption" muted>
              {w}
            </AppText>
          ))}
        </Card>
      ) : null}
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {lastSyncAt ? `Prices updated ${formatRelativeTime(lastSyncAt)} · pull to refresh` : 'Pull down to load prices'}
      </AppText>
    </View>
  );
}
