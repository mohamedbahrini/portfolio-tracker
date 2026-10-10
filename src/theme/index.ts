import { useColorScheme } from 'react-native';

const shared = {
  radius: { sm: 8, md: 12, lg: 18, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  font: { xs: 11, sm: 13, md: 15, lg: 18, xl: 24, hero: 36 },
} as const;

const dark = {
  ...shared,
  dark: true,
  colors: {
    background: '#0B0F14',
    surface: '#131A22',
    surfaceAlt: '#1A2330',
    border: '#243041',
    text: '#E8EEF5',
    textMuted: '#8A99AD',
    accent: '#5B9BFF',
    onAccent: '#06111F',
    gain: '#2BD38A',
    loss: '#FF5C6C',
    gainSoft: 'rgba(43, 211, 138, 0.16)',
    lossSoft: 'rgba(255, 92, 108, 0.16)',
    invested: '#8A99AD',
  },
};

const light: typeof dark = {
  ...shared,
  dark: false,
  colors: {
    background: '#F4F6F9',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF2F7',
    border: '#DDE3EB',
    text: '#0E1621',
    textMuted: '#5E6B7C',
    accent: '#2468E0',
    onAccent: '#FFFFFF',
    gain: '#0E9F61',
    loss: '#D93545',
    gainSoft: 'rgba(14, 159, 97, 0.12)',
    lossSoft: 'rgba(217, 53, 69, 0.12)',
    invested: '#8592A3',
  },
};

export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

/** Color for a signed amount. */
export function signColor(theme: Theme, value: number): string {
  if (value > 0) return theme.colors.gain;
  if (value < 0) return theme.colors.loss;
  return theme.colors.textMuted;
}
