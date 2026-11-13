import { useColorScheme, type TextStyle } from 'react-native';

/**
 * The app's colours, the same tokens as the website (`apps/web/src/app/globals.css`): navy ink
 * (#1a2b60) for primary actions, sky blue (#199ed6) for measurements and accents, a faint blue
 * page. Older keys (`background`, `surface`, `border`, `accent`) keep their meaning.
 */
const light = {
  /** Main text. */
  text: '#0e1733',
  textSecondary: '#2a3554',
  textMuted: '#525d78',
  textSubtle: '#6f7a93',
  /** Screen background: a very light blue-grey "paper". */
  background: '#f6f7fb',
  /** Cards, inputs, sheets. */
  surface: '#ffffff',
  /** A step below the surface: tracks, wells, unselected segments. */
  surface2: '#eef1f7',
  border: '#e2e6ef',
  borderStrong: '#cfd6e3',
  /** Buttons and selected controls. */
  primary: '#1a2b60',
  onPrimary: '#ffffff',
  /** Selected tab, focused controls. */
  tint: '#1a2b60',
  /** Links and highlighted text. */
  accent: '#0e7cb0',
  onAccent: '#ffffff',
  /** The logo's sky blue: measurements, 3D, the blueprint. */
  brand: '#199ed6',
  accentSoft: '#e3f3fc',
  onAccentSoft: '#0a3a55',
  /** Faint lines of the blueprint grid. */
  grid: 'rgba(26, 43, 96, 0.07)',
  favorite: '#e11d48',
  danger: '#b91c1c',
  success: '#047857',
  successSoft: '#d1fae5',
  onSuccessSoft: '#064e3b',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  onWarningSoft: '#451a03',
  /** The navy band (seller call-outs, sold banner); white text on it in both themes. */
  ink: '#1a2b60',
  onInk: '#ffffff',
  shadow: 'rgba(14, 23, 51, 0.10)',
};

const dark: typeof light = {
  text: '#f2f5fb',
  textSecondary: '#d6dcea',
  textMuted: '#9ba5bc',
  textSubtle: '#7f89a1',
  background: '#070b16',
  surface: '#0f1628',
  surface2: '#161f36',
  border: '#1c2640',
  borderStrong: '#2c3753',
  primary: '#eef2fb',
  onPrimary: '#0e1733',
  tint: '#38b6ec',
  accent: '#38b6ec',
  onAccent: '#04131f',
  brand: '#38b6ec',
  accentSoft: '#0e3a55',
  onAccentSoft: '#cdeefc',
  grid: 'rgba(56, 182, 236, 0.07)',
  favorite: '#fb7185',
  danger: '#f87171',
  success: '#34d399',
  successSoft: '#063b2c',
  onSuccessSoft: '#a7f3d0',
  warning: '#fbbf24',
  warningSoft: '#3a2a06',
  onWarningSoft: '#fde68a',
  ink: '#16244f',
  onInk: '#ffffff',
  shadow: 'rgba(0, 0, 0, 0.45)',
};

export type Colors = typeof light;

/** The paper behind floor plans and the grid on it: always light, like the website's plan images. */
export const PAPER = '#eef6fc';
export const PAPER_GRID = 'rgba(25, 158, 214, 0.16)';

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/**
 * Onest (drawn for Cyrillic, the website's typeface), one file per weight. `@/ui/text` picks the
 * file from `fontWeight`, so styles keep using weights.
 */
export const FONT_FAMILIES = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
} as const;

/** The Onest file for a weight: up to 400 regular, 500 medium, 600 semibold, 700 bold, 800+ extra bold. */
export function fontFamilyFor(weight: TextStyle['fontWeight']): string {
  const value =
    weight === undefined || weight === 'normal'
      ? 400
      : weight === 'bold'
        ? 700
        : typeof weight === 'number'
          ? weight
          : Number.parseInt(weight, 10) || 400;
  if (value >= 800) return FONT_FAMILIES.extrabold;
  if (value >= 700) return FONT_FAMILIES.bold;
  if (value >= 600) return FONT_FAMILIES.semibold;
  if (value >= 500) return FONT_FAMILIES.medium;
  return FONT_FAMILIES.regular;
}

/** Type scale. Big numbers are set tight, like dimensions on a drawing. */
export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  /** Section labels above content ("ОРОН ЗАЙ"). */
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1 },
} satisfies Record<string, TextStyle>;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
