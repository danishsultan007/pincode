// Design tokens. Mirrors the prototype's styles.css. No hex colors should
// appear anywhere else in the app — always import from here.

export const colors = {
  bg: '#fafaf9', surface: '#ffffff', surface2: '#f5f5f4', line: '#e7e5e4', lineStrong: '#d6d3d1',
  ink: '#1c1917', ink2: '#57534e', ink3: '#8a847d',
  accent: '#0f766e', accentInk: '#ffffff', accentSoft: '#ecf6f4',
  ask: '#0f766e', alert: '#b45309', event: '#6d5bd0',
  danger: '#b42318', dangerSoft: '#fdecea', backdrop: 'rgba(28,25,23,0.32)',
  // Logo mark only (components/ui/Logo.tsx) — distinct from `danger`, which
  // means error/destructive elsewhere in the UI.
  logoRed: '#dc2626',
} as const;

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const breakpoints = { wide: 640 } as const;
export const shadow = { popover: '0 8px 24px rgba(28,25,23,0.14)' } as const; // web boxShadow only

export const text = {
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', color: colors.ink2 },
  meta: { fontSize: 12, lineHeight: 16, color: colors.ink3 },
  secondary: { fontSize: 13, lineHeight: 18, color: colors.ink2 },
  bodySm: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink },
  wordmark: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: colors.ink },
} as const;

export const typeColor = { ask: colors.ask, alert: colors.alert, event: colors.event } as const;

export const numeric = { fontVariant: ['tabular-nums'] as const };
