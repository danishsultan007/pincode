// Design tokens — "Radar" (see /DESIGN-OVERHAUL.md). No hex colors should
// appear anywhere else in the app — always import from here.
//
// Dark mode: the palette is picked ONCE at launch from the OS setting.
// Every StyleSheet in the app reads these values at module load, so an OS
// theme switch applies on the next launch / page reload. app.config.ts sets
// userInterfaceStyle: 'automatic' so iOS/Android report 'dark'.
import { Appearance } from 'react-native';

export const scheme: 'light' | 'dark' = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

const light = {
  // neutrals — warm paper
  bg: '#F6F4F0',
  surface: '#FFFFFF',
  surface2: '#EFECE6',
  raised: '#FFFFFF', // active segment / toggle thumb (sits on surface2)
  line: '#E8E3DB',
  lineStrong: '#D5CEC3',
  ink: '#16130F',
  ink2: '#4F4943',
  ink3: '#70675E',
  onInk: '#FFFFFF', // text/icons on an `ink` background (selected chip, toast)
  // action — iris
  accent: '#4B41D6',
  accentInk: '#FFFFFF',
  accentSoft: '#EEEDFC',
  accentPressed: '#3F36BD',
  accentTint: 'rgba(75,65,214,0.08)', // map radius fill, highlighted comment
  accentInverse: '#B9B4FF', // accent-colored text on an `ink` surface (toast action)
  focusRing: 'rgba(75,65,214,0.28)',
  // post types
  ask: '#4B41D6',
  alert: '#A3540A',
  alertSoft: '#FDF1E3',
  alertTint: '#FFFAF3',
  alertLine: '#F1D3AE',
  event: '#0E7A4F',
  eventSoft: '#E6F5EC',
  // status
  success: '#0E7A4F',
  successSoft: '#E6F5EC',
  danger: '#C42B1C',
  dangerSoft: '#FCEBE8',
  backdrop: 'rgba(22,19,15,0.42)',
  // Logo mark only (components/ui/Logo.tsx) — distinct from `danger`.
  logoRed: '#F04438',
  // "Read" ticks on my own (accent-coloured) chat bubbles: must stand out from the white sent/delivered ticks.
  tickRead: '#8CF0BF',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0F0E0C',
  surface: '#1A1816',
  surface2: '#25221F',
  raised: '#2E2B27',
  line: '#2C2925',
  lineStrong: '#3D3934',
  ink: '#F3EFE8',
  ink2: '#BDB5AA',
  ink3: '#948B80',
  onInk: '#0F0E0C',
  accent: '#9D97FF',
  accentInk: '#0F0E0C',
  accentSoft: '#25234A',
  accentPressed: '#B3AEFF',
  accentTint: 'rgba(157,151,255,0.12)',
  accentInverse: '#4B41D6',
  focusRing: 'rgba(157,151,255,0.35)',
  ask: '#9D97FF',
  alert: '#F2A65A',
  alertSoft: '#2A1F12',
  alertTint: '#1E1812',
  alertLine: '#4A3518',
  event: '#5BD39A',
  eventSoft: '#13261C',
  success: '#5BD39A',
  successSoft: '#13261C',
  danger: '#FF7B6E',
  dangerSoft: '#2E1714',
  backdrop: 'rgba(0,0,0,0.6)',
  logoRed: '#FF5A4D',
  tickRead: '#0636B8',
};

export const colors: Palette = scheme === 'dark' ? dark : light;

// Deterministic fallback-avatar tints (Avatar.tsx hashes the name into this list).
const avatarLight = [
  { bg: '#E9E7FC', fg: '#3F36B8' },
  { bg: '#FDE7E3', fg: '#B2321F' },
  { bg: '#FCEFD9', fg: '#8F4A08' },
  { bg: '#DDF3EA', fg: '#0B6B45' },
  { bg: '#DEEEFA', fg: '#1D5F94' },
  { bg: '#F9E3EE', fg: '#A0285F' },
];
const avatarDark = [
  { bg: '#2A2752', fg: '#C4C0FF' },
  { bg: '#3A1E1A', fg: '#FFB3A8' },
  { bg: '#3A2A14', fg: '#F5C27E' },
  { bg: '#16302A', fg: '#86E0B7' },
  { bg: '#172B3D', fg: '#9CCBF2' },
  { bg: '#3A1B2A', fg: '#F5A8CC' },
];
export const avatarTones: { bg: string; fg: string }[] = scheme === 'dark' ? avatarDark : avatarLight;

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 40, s8: 48 } as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const breakpoints = { wide: 640 } as const;

// CSS box-shadow strings — RN 0.86 (new arch) renders these on iOS, Android and web.
export const shadow =
  scheme === 'dark'
    ? {
        xs: '0 1px 2px rgba(0,0,0,0.5)',
        card: '0 1px 2px rgba(0,0,0,0.4)',
        fab: '0 8px 24px -6px rgba(0,0,0,0.6)',
        popover: '0 16px 40px -8px rgba(0,0,0,0.7)',
      }
    : {
        xs: '0 1px 2px rgba(22,19,15,0.06)',
        card: '0 1px 2px rgba(22,19,15,0.04), 0 6px 20px -8px rgba(22,19,15,0.10)',
        fab: '0 10px 24px -6px rgba(75,65,214,0.45)',
        popover: '0 12px 32px -8px rgba(22,19,15,0.22)',
      };

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  pulse: 900, // Skeleton half-cycle
  breathe: 2400, // RadarRings half-cycle
  pressScale: 0.97, // buttons, chips, vote pills
  pressScaleCard: 0.985, // cards
  pressOpacity: 0.92,
} as const;

// Font family names = keys registered by useFonts (src/theme/fonts.ts).
export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const text = {
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink3 },
  meta: { fontSize: 12, lineHeight: 16, color: colors.ink3 },
  secondary: { fontSize: 13, lineHeight: 18, color: colors.ink2 },
  bodySm: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },
  wordmark: { fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.ink },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, color: colors.ink },
  // — new —
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.ink2 },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.1, color: colors.ink },
  bodyLg: { fontSize: 17, lineHeight: 26, color: colors.ink2 },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: colors.ink },
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  hero: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1.4, color: colors.ink },
} as const;

export const typeColor = { ask: colors.ask, alert: colors.alert, event: colors.event } as const;
export const typeSoft = { ask: colors.accentSoft, alert: colors.alertSoft, event: colors.eventSoft } as const;

export const numeric = { fontVariant: ['tabular-nums'] as const };
