import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { signColor, useTheme } from '@/theme';
import { formatPercent, formatSignedMoney } from '@/utils/format';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.colors.surface, borderRadius: t.radius.lg, borderColor: t.colors.border, padding: t.space.lg },
        styles.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type TextVariant = 'hero' | 'title' | 'body' | 'label' | 'caption';

export function AppText({
  children,
  variant = 'body',
  muted,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const variants: Record<TextVariant, TextStyle> = {
    hero: { fontSize: t.font.hero, fontWeight: '700', letterSpacing: -0.5 },
    title: { fontSize: t.font.lg, fontWeight: '700' },
    body: { fontSize: t.font.md },
    label: { fontSize: t.font.sm, fontWeight: '600', letterSpacing: 0.3 },
    caption: { fontSize: t.font.xs },
  };
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: color ?? (muted ? t.colors.textMuted : t.colors.text), fontVariant: ['tabular-nums'] },
        variants[variant],
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Signed amount with optional percentage, colored by sign. */
export function GainText({
  value,
  pct,
  currency,
  variant = 'body',
}: {
  value: number;
  pct?: number;
  currency: string;
  variant?: TextVariant;
}) {
  const t = useTheme();
  return (
    <AppText variant={variant} color={signColor(t, value)} style={{ fontWeight: '600' }}>
      {formatSignedMoney(value, currency)}
      {pct !== undefined ? `  (${formatPercent(pct)})` : ''}
    </AppText>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.colors.accent : variant === 'danger' ? t.colors.lossSoft : t.colors.surfaceAlt;
  const fg = variant === 'primary' ? t.colors.onAccent : variant === 'danger' ? t.colors.loss : t.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderRadius: t.radius.md, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <AppText color={fg} variant="label">{title}</AppText>}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { borderRadius: t.radius.sm, backgroundColor: active ? t.colors.surface : 'transparent' }]}
          >
            <AppText variant="label" color={active ? t.colors.text : t.colors.textMuted}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={t.colors.textMuted}
        {...input}
        style={[
          styles.input,
          {
            color: t.colors.text,
            backgroundColor: t.colors.surfaceAlt,
            borderColor: error ? t.colors.loss : t.colors.border,
            borderRadius: t.radius.md,
            fontSize: t.font.md,
          },
          input.style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color={t.colors.loss}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function ScreenScroll({ children, refreshControl }: { children: ReactNode; refreshControl?: React.ReactElement }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.space.lg, gap: t.space.lg, paddingBottom: t.space.xxl * 2 }}
      refreshControl={refreshControl as React.ComponentProps<typeof ScrollView>['refreshControl']}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', gap: t.space.sm, paddingVertical: t.space.xxl }}>
      <AppText variant="title">{title}</AppText>
      <AppText muted style={{ textAlign: 'center' }}>
        {message}
      </AppText>
      {action ? <View style={{ marginTop: t.space.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </Card>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  button: { minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', padding: 3 },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
