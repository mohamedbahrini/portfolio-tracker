import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { SyncProgress } from '@/services/priceSync';
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
    return <SyncingCard progress={status.progress} />;
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

function SyncingCard({ progress }: { progress?: SyncProgress }) {
  const t = useTheme();
  const seconds = useSecondsUntil(progress?.nextBatchAt);
  const waiting = seconds > 0;

  let detail = 'Contacting Twelve Data…';
  if (progress && waiting) detail = `Next batch in ${seconds}s · ${progress.done} of ${progress.total} done`;
  else if (progress?.current) detail = `Fetching ${progress.current}`;

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md, padding: t.space.md }}>
      <ActivityIndicator color={t.colors.accent} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">Updating prices{progress ? ` · ${progress.done}/${progress.total}` : ''}</AppText>
        <AppText variant="caption" muted numberOfLines={2}>
          {detail}
        </AppText>
      </View>
    </Card>
  );
}

/** Whole seconds remaining until `timestamp`, ticking every second; 0 when past or absent. */
function useSecondsUntil(timestamp: number | undefined): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!timestamp) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [timestamp]);
  return timestamp ? Math.max(0, Math.ceil((timestamp - now) / 1000)) : 0;
}
