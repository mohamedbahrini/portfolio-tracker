import { memo, useCallback, useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

export interface ChartSeries {
  values: readonly number[];
  color: string;
  /** Draw a gradient area under the line. */
  fill?: boolean;
  dashed?: boolean;
}

interface Props {
  series: readonly ChartSeries[];
  height?: number;
  /** Called with the scrubbed index while the user drags, and `null` on release. */
  onScrub?: (index: number | null) => void;
}

const PAD_Y = 12;
const MAX_POINTS = 360;

/** Evenly samples indices so long histories stay cheap to draw. Always keeps the last point. */
function sampleIndices(length: number): number[] {
  if (length <= MAX_POINTS) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => Math.round(i * step));
}

function LineChartImpl({ series, height = 220, onScrub }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const length = series[0]?.values.length ?? 0;

  const geometry = useMemo(() => {
    if (width === 0 || length < 2) return null;
    const indices = sampleIndices(length);
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const i of indices) {
        const v = s.values[i] ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (max - min < 1e-9) {
      max += 1;
      min -= 1;
    }
    const x = (i: number) => (i / (length - 1)) * width;
    const y = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * (height - PAD_Y * 2);
    const paths = series.map((s) => {
      const d = indices.map((i, n) => `${n === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.values[i] ?? 0).toFixed(1)}`).join('');
      return { line: d, area: `${d}L${width},${height}L0,${height}Z` };
    });
    return { x, y, paths };
  }, [series, width, height, length]);

  const indexFromEvent = useCallback(
    (e: GestureResponderEvent) => {
      const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / Math.max(width, 1)));
      return Math.round(ratio * (length - 1));
    },
    [width, length],
  );

  const handleMove = (e: GestureResponderEvent) => {
    const i = indexFromEvent(e);
    if (i !== scrub) {
      setScrub(i);
      onScrub?.(i);
    }
  };
  const handleEnd = () => {
    setScrub(null);
    onScrub?.(null);
  };

  return (
    <View
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => length > 1}
      onMoveShouldSetResponder={() => length > 1}
      onResponderGrant={handleMove}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={handleEnd}
      accessibilityRole="image"
      accessibilityLabel="Portfolio value chart. Drag to inspect a date."
    >
      {geometry ? (
        <Svg width={width} height={height}>
          <Defs>
            {series.map((s, i) => (
              <LinearGradient key={i} id={`fill${i}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={s.color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={s.color} stopOpacity={0} />
              </LinearGradient>
            ))}
          </Defs>
          {series.map((s, i) =>
            s.fill ? <Path key={`a${i}`} d={geometry.paths[i]!.area} fill={`url(#fill${i})`} /> : null,
          )}
          {series.map((s, i) => (
            <Path
              key={`l${i}`}
              d={geometry.paths[i]!.line}
              stroke={s.color}
              strokeWidth={s.dashed ? 1.5 : 2.25}
              strokeDasharray={s.dashed ? '5,5' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          ))}
          {scrub !== null ? (
            <>
              <Line
                x1={geometry.x(scrub)}
                x2={geometry.x(scrub)}
                y1={0}
                y2={height}
                stroke={t.colors.textMuted}
                strokeWidth={1}
                strokeDasharray="3,4"
              />
              {series.map((s, i) => (
                <Circle
                  key={`c${i}`}
                  cx={geometry.x(scrub)}
                  cy={geometry.y(s.values[scrub] ?? 0)}
                  r={4.5}
                  fill={s.color}
                  stroke={t.colors.surface}
                  strokeWidth={2}
                />
              ))}
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

export const LineChart = memo(LineChartImpl);
