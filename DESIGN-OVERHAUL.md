# pincode — Design Overhaul Spec ("Radar")

Target: the Expo / React Native (+ react-native-web) app in `mobile/`. Legacy `index.html` / `app.js` are out of scope.
Audience: an implementer who follows this mechanically. Every value here is final — do not substitute.

---

## 1. Concept

**Radar.** pincode is a pin dropped on warm paper, with signal rings spreading out from it: the feed is already sorted in distance rings (1 / 3 / 5 km), so concentric rings become the one visual motif. They appear on the welcome hero, in empty states and in feed ring dividers. The UI is calm and mostly neutral: warm paper backgrounds, white cards that lift slightly, soft pill shapes and generous spacing. Color is used sparingly. **Iris** (indigo-violet) is the action color, the **coral pin** is the brand mark, and amber and green are reserved for Alert and Event. Typography is set in **Plus Jakarta Sans**, with heavy, tightly tracked headlines over relaxed body text. It should feel friendly, modern and quiet, with a proper dark mode.

---

## 2. Global rules

1. **No hex / rgba literals outside `src/theme/tokens.ts`.** The string `'transparent'` is allowed.
2. **Dark mode is chosen once, at launch.** `tokens.ts` reads `Appearance.getColorScheme()` when the module loads and exports either the light or the dark palette as `colors`. Every existing `StyleSheet.create` keeps working unchanged. If the OS theme changes while the app is open, the new theme applies after a relaunch or page reload. This is intended; do not build a live-switching ThemeContext.
3. **Fonts:** all text goes through `components/ui/Text.tsx`, which maps `fontWeight` to a Plus Jakarta Sans family and then forces `fontWeight: 'normal'`. This prevents faux-bold on web and Android. The only raw `TextInput`s are `TextField` and `SearchInput`, and they set `fontFamily: font.regular`. Never pass `fontFamily` anywhere else.
4. **Shadows** are CSS `boxShadow` strings from `shadow.*`. RN 0.86 (new architecture) supports them on iOS, Android and web. Remove the old `as any` casts where they were only there for `boxShadow`.
5. **Press feedback** is a style-function `transform: [{ scale }]` plus opacity, using the `motion.*` values. No animation library.
6. Any `Animated` call uses `useNativeDriver: Platform.OS !== 'web'`.
7. Do not change behavior, navigation, data flow or copy strings. The only text changes allowed are the cosmetic ones this spec names explicitly.

---

## 3. Tokens — replace `mobile/src/theme/tokens.ts` entirely

Every existing export (`colors`, `space`, `radius`, `breakpoints`, `shadow`, `text`, `typeColor`, `numeric`) and every existing key keeps its name. New keys and exports are additive.

```ts
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
```

Contrast (WCAG): every text and background pair above was checked. ink3 on bg is 4.8:1 (light) and 5.8:1 (dark). Accent on white is 6.9:1, and the dark accent on surface is 7.0:1. Alert on alertSoft is 4.9:1, event on eventSoft 4.8:1, danger on dangerSoft 4.9:1. All pass AA for body text.

### 3a. New file `mobile/src/theme/fonts.ts`

```ts
import type { TextStyle } from 'react-native';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { font } from './tokens';

export const fontAssets = {
  [font.regular]: PlusJakartaSans_400Regular,
  [font.medium]: PlusJakartaSans_500Medium,
  [font.semibold]: PlusJakartaSans_600SemiBold,
  [font.bold]: PlusJakartaSans_700Bold,
  [font.extrabold]: PlusJakartaSans_800ExtraBold,
};

// Each weight is its own single-weight family, so callers keep writing
// fontWeight and Text.tsx swaps it for the matching family.
export function fontFor(weight: TextStyle['fontWeight'] | undefined): string {
  switch (String(weight ?? '400')) {
    case '500':
      return font.medium;
    case '600':
      return font.semibold;
    case '700':
    case 'bold':
      return font.bold;
    case '800':
    case '900':
      return font.extrabold;
    default:
      return font.regular;
  }
}
```

### 3b. Config

- From `mobile/`, run `npx expo install expo-font @expo-google-fonts/plus-jakarta-sans`. This adds the only new dependencies. Both are small, first-party Expo packages.
- In `mobile/app.config.ts`, set `userInterfaceStyle: 'automatic'` and change the `expo-notifications` plugin to `{ color: '#4B41D6' }`. This is a config file, so the no-hex rule does not apply.

---

## 4. App shell

### 4a. `mobile/src/app/_layout.tsx`

- Imports: `Platform` from react-native; `Stack, ThemeProvider, DarkTheme, DefaultTheme` from `'expo-router'`; `useFonts` from `'expo-font'`; `fontAssets` from `'@/theme/fonts'`; `colors, scheme, space` from tokens.
- At module top level, under the imports:

```ts
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.colorScheme = scheme;
  document.body.style.backgroundColor = colors.bg;
}

const baseNavTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
const navTheme = {
  ...baseNavTheme,
  colors: {
    ...baseNavTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    notification: colors.accent,
  },
};
```

- At the top of `RootLayout()`:

```ts
const [fontsLoaded, fontError] = useFonts(fontAssets);
if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
```

- Wrap everything inside `<SafeAreaProvider>` in `<ThemeProvider value={navTheme}>`.
- Change `<StatusBar style="dark" />` to `<StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />`.
- Leave everything else as it is.

### 4b. Tab bar — `mobile/src/app/(tabs)/_layout.tsx`

```ts
import { StyleSheet } from 'react-native';
import { colors, font } from '@/theme/tokens';

function tabIcon(name: IconName) {
  return ({ color, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Icon name={name} size={22} color={String(color)} strokeWidth={focused ? 2.2 : 1.8} />
  );
}

// screenOptions:
headerShown: false,
tabBarActiveTintColor: colors.accent,
tabBarInactiveTintColor: colors.ink3,
tabBarStyle: {
  backgroundColor: colors.surface,
  borderTopColor: colors.line,
  borderTopWidth: StyleSheet.hairlineWidth,
  elevation: 0,
},
tabBarLabelStyle: { fontFamily: font.semibold, fontWeight: 'normal', fontSize: 11, letterSpacing: 0.1 },
tabBarBadgeStyle: {
  backgroundColor: colors.accent,
  color: colors.accentInk,
  fontFamily: font.bold,
  fontWeight: 'normal',
  fontSize: 10,
},
```

Do not set `height` on the tab bar, because it would break the bottom safe-area inset.

---

## 5. Primitives — `mobile/src/components/ui/*`

### Text.tsx (full replacement)

```tsx
import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, TextStyle } from 'react-native';
import { numeric as numericStyle, text } from '@/theme/tokens';
import { fontFor } from '@/theme/fonts';

export type TextVariant = keyof typeof text;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  numeric?: boolean;
  numberOfLines?: number;
};

export function Text({ variant = 'body', numeric, style, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten([
    styles.base,
    text[variant] as TextStyle,
    numeric ? (numericStyle as TextStyle) : null,
    style,
  ]) ?? {}) as TextStyle;
  return <RNText style={[flat, { fontFamily: fontFor(flat.fontWeight), fontWeight: 'normal' }]} {...rest} />;
}

const styles = StyleSheet.create({ base: { fontWeight: '400' } });
```

### Icon.tsx

- Add the optional prop `strokeWidth?: number`, defaulting to `STROKE_WIDTH` (1.8). Pass it to `<Svg strokeWidth={strokeWidth}>`.
- Nothing else changes.

### Button.tsx

- Widen the size type to `ButtonSize = 'lg' | 'md' | 'sm'`.
- Heights: `{ lg: 52, md: 44, sm: 36 }`. Horizontal padding: `{ lg: 24, md: 20, sm: 14 }`. For `variant="text"`, override padding to `sm: 8`, otherwise 12.
- `base`: `borderRadius: radius.pill`, `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'center'`.
- Variants:
  - `primary`: `{ backgroundColor: colors.accent }`. While pressed, the background becomes `colors.accentPressed`.
  - `ghost`: `{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong }`.
  - `text`: `{ backgroundColor: 'transparent' }`.
  - `danger`: `{ backgroundColor: colors.danger }`.
- Label: `<Text variant="button" style={{ color: textColor[variant], fontSize: size === 'lg' ? 16 : size === 'sm' ? 14 : 15 }}>`. The text colors stay as they are (primary/danger use `accentInk`, ghost uses `ink`, text uses `accent`).
- Icon size: 18 for lg and md, 16 for sm.
- Pressed (when not disabled): `{ transform: [{ scale: motion.pressScale }], opacity: motion.pressOpacity }`.
- Disabled: `{ opacity: 0.4 }`.

### Card.tsx

```ts
base: {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.line,
  padding: space.s4,
  gap: space.s3,
  boxShadow: shadow.card,
},
alert: { backgroundColor: colors.alertTint, borderColor: colors.alertLine }, // replaces the 2px left rule
past: { opacity: 0.7 },
pressed: { transform: [{ scale: motion.pressScaleCard }], opacity: 0.96 },
```

The `Pressable` wrapper gets `accessibilityRole="button"` and `style={({ pressed }) => [pressed ? styles.pressed : null]}`.

### Chip.tsx

- `base`: `height: 34`, `borderRadius: radius.pill`, `paddingHorizontal: 14`, `borderWidth: 1`, centered.
- Idle: `{ backgroundColor: colors.surface, borderColor: colors.line }`, label color `ink2`, weight `'500'`.
- Selected: `{ backgroundColor: colors.ink, borderColor: colors.ink }`, label color `colors.onInk`, weight `'600'`.
- Pressed prop: `{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }`, label color `accent`, weight `'600'`.
- Convert `style` to a function. When the touch is pressed, add `{ transform: [{ scale: motion.pressScale }] }`.

### Avatar.tsx

- Add the prop `shape?: 'circle' | 'rounded'`, defaulting to `'circle'`. The corner radius is `size / 2` for circle and `Math.round(size * 0.3)` for rounded.
- The fallback tone is chosen by hashing the name:

```ts
let h = 0;
for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
const tone = avatarTones[h % avatarTones.length];
```

- Fallback view: `backgroundColor: tone.bg`.
- Initial: `color: tone.fg`, `fontSize: size * 0.42`, `lineHeight: Math.round(size * 0.42 * 1.2)`, `fontWeight: '700'`.
- The image style keeps `backgroundColor: colors.surface2`.

### Badge.tsx

- Pill: `height: 22`, `paddingHorizontal: space.s2`, `borderRadius: radius.pill`, `justifyContent: 'center'`, `alignSelf: 'flex-start'`.
- Label: `variant="meta"` with `{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.2 }`.
- Tones:
  - neutral: `surface2` / `ink2`
  - accent: `accentSoft` / `accent`
  - **warn: `alertSoft` / `alert`** (this fixes the old danger-tinted warn)
  - danger: `dangerSoft` / `danger`

### Banner.tsx

- `wrap`: `borderRadius: radius.md`, `paddingVertical: space.s3`, `paddingHorizontal: space.s4`, `gap: space.s3`.
- Neutral: `backgroundColor: colors.surface2`. Warn: `backgroundColor: colors.alertSoft`.
- Warn only: render `<Icon name="alert" size={16} color={colors.alert} />` before the text.
- Text: `variant="bodySm"`, `color: colors.ink`.

### Header.tsx

- Add the prop `large?: boolean`.
- Shared `row`: `height: 56`, `paddingHorizontal: space.s3`, `backgroundColor: colors.bg`, **no bottom border** (delete `borderBottomWidth` and `borderBottomColor`).
- The normal-mode centered title stays `variant="cardTitle"`. The wordmark mode is unchanged apart from the shared row style.
- Large mode, checked first and only used when `large && title`:

```tsx
if (large && title) {
  return (
    <View style={styles.largeWrap}>
      {left ? (
        <View style={styles.largeTopRow}>
          <View style={styles.side}>{left}</View>
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
      ) : null}
      <View style={[styles.largeTitleRow, !left && styles.largeTitleRowSolo]}>
        <Text variant="display" numberOfLines={1} accessibilityRole="header" style={styles.largeTitle}>
          {title}
        </Text>
        {!left && right ? <View style={styles.actions}>{right}</View> : null}
      </View>
    </View>
  );
}
// styles:
largeWrap: { backgroundColor: colors.bg, paddingBottom: space.s2 },
largeTopRow: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.s3 },
largeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s4, minHeight: 44 },
largeTitleRowSolo: { paddingTop: space.s4 },
largeTitle: { flex: 1, minWidth: 0 },
```

### IconButton.tsx

- `TOUCH_TARGET = 36`.
- Pressed: `{ backgroundColor: colors.surface2, transform: [{ scale: 0.94 }] }`.
- Nothing else changes.

### ListRow.tsx

- Row: `paddingVertical: 14`, `minHeight: 52`, `gap: space.s3`.
- Title: `variant="body"` with `fontWeight: '500'`.
- Add the prop `destructive?: boolean`. When set, the title color is `colors.danger`.
- Chevron: 16, `ink3`.

### ListGroup.tsx (new)

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '@/theme/tokens';

// Inset grouped card for ListRows (settings). Hairline separators between children.
export function ListGroup({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.sep} /> : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: space.s4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.s4 },
});
```

### RadarRings.tsx (new — the motif)

```tsx
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, motion } from '@/theme/tokens';

export type RadarRingsProps = { size?: number; color?: string; pulse?: boolean; children?: React.ReactNode };

// Three concentric rings around a center (the pin). `pulse` = slow "breathing"
// scale on the rings; skipped when the OS asks for reduced motion.
export function RadarRings({ size = 96, color = colors.accent, pulse, children }: RadarRingsProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      const opts = { duration: motion.breathe, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' };
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.04, ...opts }),
          Animated.timing(scale, { toValue: 1, ...opts }),
        ])
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse, scale]);

  const c = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={c - 1} stroke={color} strokeOpacity={0.12} strokeWidth={1.5} fill={color} fillOpacity={0.03} />
          <Circle cx={c} cy={c} r={c * 0.68} stroke={color} strokeOpacity={0.2} strokeWidth={1.5} fill={color} fillOpacity={0.04} />
          <Circle cx={c} cy={c} r={c * 0.38} stroke={color} strokeOpacity={0.32} strokeWidth={1.5} fill={color} fillOpacity={0.07} />
        </Svg>
      </Animated.View>
      {children}
    </View>
  );
}
```

### EmptyState.tsx

- Add the prop `icon?: IconName`, defaulting to `'pin'`.
- Layout, top to bottom:
  1. `<RadarRings size={88}><Icon name={icon} size={22} color={colors.accent} /></RadarRings>` with `marginBottom: space.s2`
  2. Title: `variant="cardTitle"`, `fontSize: 17`, centered
  3. Text: `variant="secondary"`, centered, `maxWidth: 300`
- `wrap`: `{ alignItems: 'center', paddingVertical: space.s7, paddingHorizontal: space.s5, gap: space.s2 }`.
- `actions`: `marginTop: space.s4`, `gap: space.s2`.

### RingDivider.tsx

- Row: `paddingVertical: space.s4`, `paddingHorizontal: 0`, `gap: space.s3`. Lines stay hairline in `colors.line`.
- Replace the bare label with a center pill: `{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: space.s3, borderRadius: radius.pill, backgroundColor: colors.surface2 }`.
- The pill contains a 14×14 `Svg`: `<Circle cx={7} cy={7} r={6} />` and `<Circle cx={7} cy={7} r={2.5} />`, both with `stroke={colors.ink3}`, `strokeWidth={1.4}`, `fill="none"`. Follow it with `<Text variant="label">{label}</Text>`.
- `FeedList` already adds horizontal padding, which is why the row's own `paddingHorizontal` is 0.

### SearchInput.tsx

- `wrap`: `height: 44`, `borderRadius: radius.pill`, `borderWidth: 0`, `backgroundColor: colors.surface2`, `paddingHorizontal: 14`, `gap: space.s2`.
- `wrapCompact`: `{ height: 38 }`.
- Search icon: 16, `ink3`.
- `input`:

```ts
input: {
  flex: 1,
  minWidth: 0,
  fontSize: 16,
  color: colors.ink,
  fontFamily: font.regular,
  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
},
```

### SectionTitle.tsx

- `paddingTop: space.s5`, `paddingBottom: space.s2`. Everything else stays.

### Segmented.tsx

- `track`: `{ backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 3, gap: 2 }`.
- `segment`: `{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center' }`.
- `active`: `{ backgroundColor: colors.raised, boxShadow: shadow.xs }`.
- Label: active is `ink` at `'700'`, inactive is `ink2` at `'500'`.

### Sheet.tsx

- `wrap`: top corner radii `radius.xl`.
- `handle`: 40×5, `marginTop: 10`, `lineStrong`.
- `header`: `paddingHorizontal: space.s5`, `paddingTop: space.s4`, `paddingBottom: space.s3`.
- Title: `variant="headline"`.

### Skeleton.tsx

- Default radius becomes `radius.md`. Background stays `colors.surface2`.
- Pulse goes 0.45 → 1 → 0.45 with `duration: motion.pulse` on each leg, using `useNativeDriver: Platform.OS !== 'web'`.

### TextField.tsx

- `wrap`: `{ gap: 6 }`.
- Label: `<Text variant="fieldLabel">`. Drop `styles.label`'s `marginBottom`. The label text is no longer uppercase; this is the only cosmetic copy change here.
- Styles:

```ts
field: {
  flexDirection: 'row', alignItems: 'center', gap: space.s2,
  borderWidth: 1.5, borderColor: 'transparent', borderRadius: radius.md,
  paddingHorizontal: 14, minHeight: 48, backgroundColor: colors.surface2,
},
multilineField: { minHeight: 112, alignItems: 'flex-start', paddingVertical: space.s3 },
focused: { borderColor: colors.accent, backgroundColor: colors.surface, boxShadow: `0 0 0 4px ${colors.focusRing}` },
errorField: { borderColor: colors.danger },
input: {
  flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22, color: colors.ink, fontFamily: font.regular, paddingVertical: 10,
  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
},
multilineInput: { minHeight: 84, textAlignVertical: 'top' },
prefix: { color: colors.ink2, fontWeight: '600' },
errorText: { color: colors.danger, fontWeight: '500' },
```

The 16px input font size prevents iOS Safari from zooming the page on focus.

### Wordmark.tsx

- Gap: sm uses 8, lg uses `space.s3`.
- `nameSm`: `{ fontSize: 18, lineHeight: 20 }`.
- `nameLg`: `{ fontSize: 34, lineHeight: 38 }`.
- `taglineSm`: `{ fontSize: 11, lineHeight: 13, color: colors.ink3 }`.

### AvailabilityHint.tsx

- Change `ok` to `colors.success`.

### DetailState / Divider / ChipRow / Screen / Logo

- No code changes. They pick up the new tokens.

### Providers (WP1)

**`providers/ToastProvider.tsx`**

- Host: `bottom: 96` so the toast clears the tab bar and the FAB.
- Pill:

```ts
{
  backgroundColor: colors.ink,
  borderRadius: radius.pill,
  paddingVertical: space.s3,
  paddingHorizontal: 18,
  boxShadow: shadow.popover,
  maxWidth: 520,
}
```

- Message color: `colors.onInk`.
- Action: color `colors.accentInverse`, weight `'700'`.
- Enter animation: `anim = useRef(new Animated.Value(0)).current`. On every new `toast`, call `anim.setValue(0)` and then run `Animated.timing(anim, { toValue: 1, duration: motion.base, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start()`. Make the pill an `Animated.View` with `opacity: anim` and `translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })`.

**`providers/ActionSheetProvider.tsx`**

- `menu`: `borderRadius: radius.lg`, `padding: 6`, `boxShadow: shadow.popover`. Keep the border in `line`.
- `menuRow`: `{ minHeight: 44, borderRadius: radius.sm, paddingHorizontal: space.s3 }`.
- `confirmCard`: `{ borderRadius: radius.xl, padding: space.s5, gap: space.s2, borderWidth: 1, borderColor: colors.line, boxShadow: shadow.popover }`.
- Confirm title: `variant="headline"`.
- `confirmActions`: `marginTop: space.s4`.

---

## 6. Screens and feature components

### WP2 — Home feed (`app/(tabs)/index.tsx`, `components/post/*` feed parts, `components/map/*`)

**`(tabs)/index.tsx`**

- `searchRow`: `{ paddingHorizontal: space.s4, paddingTop: space.s1 }`.
- `toolbar`: `height: 36`, `marginVertical: space.s3`.
- `locationPill`:

```ts
{
  height: 34,
  paddingHorizontal: space.s3,
  gap: 6,
  borderWidth: 0,
  backgroundColor: colors.surface2,
  borderRadius: radius.pill,
}
```

  Its pin icon is `color={colors.accent}`. The label is `variant="secondary"` with `{ color: colors.ink, fontWeight: '600' }`. The chevron is 12, `ink3`.
- `sortButton`: `height: 34`, `paddingHorizontal: space.s3`, `borderRadius: radius.pill`. The label is secondary, `'600'`. The chevron is `ink3`.
- `viewToggle`:
  - Track: `{ borderRadius: radius.pill, padding: 3, backgroundColor: colors.surface2 }`
  - Button: `{ width: 34, height: 28, borderRadius: radius.pill }`
  - Active button: `{ backgroundColor: colors.raised, boxShadow: shadow.xs }`
- `mapWrap`: add `borderRadius: radius.lg` and `overflow: 'hidden'`.
- `hereButtonWrap`: add `borderRadius: radius.pill` and `boxShadow: shadow.popover`.
- Skeletons: three `<Skeleton height={140} radius={radius.lg} />`.
- FAB:
  - `fabWrap`: `{ position: 'absolute', right: space.s4, bottom: space.s5, borderRadius: radius.pill, boxShadow: shadow.fab }`
  - The Button gets `size="lg"`
  - `contentBottomInset` changes from 88 to 104

**`FeedList.tsx`**

- `content`: `{ paddingHorizontal: space.s4, paddingTop: space.s1, paddingBottom: space.s6, gap: space.s3 }`.

**`PostCard.tsx`** — new layout, same data and handlers:

```tsx
<Card onPress={...} variant={...}>
  <View style={styles.topRow}>
    <View style={styles.topLeft}>
      <TypeLabel type={post.type} kind={post.kind} />
      {post.tag ? <Text variant="meta" numberOfLines={1} style={styles.tag}>{post.tag}</Text> : null}
    </View>
    <Text variant="meta" numeric>{distance}{timeAgo}</Text>
  </View>
  {modBadge ? <Badge label={modBadge.label} tone={modBadge.tone} /> : null}
  <View style={styles.textBlock}>
    <Text variant="cardTitle" numberOfLines={2}>{post.title}</Text>
    {post.community_name ? <Text variant="meta" numberOfLines={1} style={styles.community}>in {post.community_name}</Text> : null}
    {post.body ? <Text variant="bodySm" numberOfLines={2}>{post.body}</Text> : null}
  </View>
  {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.image} /> : null}
  <View style={styles.footRow}>
    <VoteButton count={post.upvote_count} mine={post.my_vote} onPress={handleVote} />
    <View style={styles.status}><PostStatusLine post={post} /></View>
    <Text variant="meta" numberOfLines={1} style={styles.footArea}>{[post.area, post.pincode].filter(Boolean).join(' · ')}</Text>
  </View>
</Card>
// styles
topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
topLeft: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexShrink: 1, minWidth: 0 },
tag: { flexShrink: 1 },
textBlock: { gap: 4 },
community: { color: colors.accent, fontWeight: '600' },
image: { width: '100%', height: 184, borderRadius: radius.md, backgroundColor: colors.surface2 },
footRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
status: { flex: 1, minWidth: 0 },
footArea: { flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
```

The tag loses its `"· "` prefix because the pill already separates it; this is a cosmetic change. Delete the `modRow` and `bottomRow` styles.

**`TypeLabel.tsx`** — type pill. Update the header comment, since type color now appears as a tinted pill.

```ts
row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: space.s2, borderRadius: radius.pill },
// render: style={[styles.row, { backgroundColor: typeSoft[type] }]}
dot: { width: 6, height: 6, borderRadius: 3 },  // backgroundColor typeColor[type]
// label: <Text variant="label" style={{ color: typeColor[type], letterSpacing: 0.6 }}>
```

**`VoteButton.tsx`**

- `base`: `{ height: 32, paddingHorizontal: space.s3, gap: 5, borderRadius: radius.pill, borderWidth: 0 }`.
- Idle: `{ backgroundColor: colors.surface2 }`. Active: `{ backgroundColor: colors.accentSoft }`.
- Icon: 15.
- Count: `fontWeight: '600'` in both states. Color is `ink2` idle and `accent` active.
- Convert the style to a function. When pressed, add `{ transform: [{ scale: motion.pressScale }] }`.

**`ReactionBar.tsx`**

- `chip`: `height: 30`, `paddingHorizontal: 10`, `gap: 4`, `borderRadius: radius.pill`.
- Idle: `{ backgroundColor: colors.surface, borderColor: colors.line }`.
- Active: `{ backgroundColor: colors.accentSoft, borderColor: colors.accent }`.
- `row` gap: `space.s2`.

**`PostStatusLine.tsx`**

- The "answered in" check icon and text use `colors.success` and `fontWeight: '600'`.
- `styles.accent` becomes `{ color: colors.accent, fontWeight: '600' }`.
- Neutral lines use `variant="secondary"`, unchanged.
- Add `numberOfLines={1}` to every Text.

**`AlertMini.tsx`**

```ts
wrap: {
  width: 240,
  backgroundColor: colors.alertTint,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.alertLine,
  padding: space.s3,
  gap: 6,
}
```

- Delete the `borderLeft*` styles.
- The title becomes `variant="body"` with `fontWeight: '600'`, 2 lines.
- The top row is unchanged (dot, ALERT label in `alert`, meta).

**`AlertsStrip.tsx`**

- `row`: `gap: space.s3`, `paddingVertical: space.s1`.

**`DateBlock.tsx`** — event-colored now:

```ts
wrap: { width: 48, height: 52, borderRadius: radius.md, backgroundColor: colors.eventSoft }
day: { color: colors.event, fontSize: 20, lineHeight: 22, fontWeight: '800' }
month: { color: colors.event, fontSize: 10, letterSpacing: 0.6 }
```

**Maps**

- `PostsMap.native.tsx`: replace `fillColor="rgba(15,118,110,0.06)"` with `fillColor={colors.accentTint}`.
- No other map changes. The Leaflet tiles stay light in dark mode, which is acceptable.

### WP3 — Post detail, comments, compose (`app/post/**`, `components/comments/*`, `app/compose.tsx`, `components/forms/*`, `app/location.tsx`, `app/report.tsx`)

**`post/[id]/index.tsx`**

- `content`: `{ padding: space.s4, gap: space.s4, paddingBottom: space.s7 }`.
- `image`: `height: 260`, `borderRadius: radius.lg`.
- The title stays `variant="title"`.
- The community link keeps the accent color and adds `fontWeight: '600'`.
- `authorRow` becomes a card row:

```ts
{
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.s3,
  padding: space.s3,
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.line,
}
```

  The Avatar is `size={40}`. The name is `variant="body"` with `fontWeight: '600'`. Inside the Pressable, append `<View style={{ flex: 1 }} /><Icon name="chevron-right" size={16} color={colors.ink3} />`.
- Keep the Dividers.
- The `SectionHeader` label is unchanged.

**`post/[id]/thread/[commentId].tsx`**

- Apply the same `content`, `image` and `authorRow` treatment wherever those styles exist. Otherwise, tokens only.

**`CommentItem.tsx`**

- Avatar 24. The author name is `variant="secondary"` with `{ color: colors.ink, fontWeight: '600' }`.
- `rail`: `{ width: 2, borderRadius: 1, backgroundColor: colors.line, marginRight: space.s2 }`.
- `row`: `paddingVertical: space.s3`.
- `voteChip`: same as VoteButton but `height: 28`.
  - Idle: `{ backgroundColor: colors.surface2, borderColor: 'transparent' }`
  - Active: `{ backgroundColor: colors.accentSoft, borderColor: 'transparent' }`
  - Count weight `'600'`

**`CommentThread.tsx`**

- `highlight`: `{ backgroundColor: colors.accentTint, borderRadius: radius.md }`.
- Add horizontal padding `space.s2` if the style has none.

**`CommentComposer.tsx`**

- `wrap`:

```ts
{
  backgroundColor: colors.surface,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: colors.line,
  paddingHorizontal: space.s3,
  paddingVertical: space.s2,
  gap: space.s2,
}
```

- Wrap the `TextField` in `<View style={{ flex: 1 }}>`.
- Replace the send `IconButton` with a Pressable that keeps the same `accessibilityRole="button"`, `accessibilityLabel="Send"` and `onPress`/`disabled` logic:
  - Style: 40×40, `borderRadius: radius.pill`, centered, `backgroundColor: disabled ? colors.surface2 : colors.accent`
  - Icon: `<Icon name="send" size={18} color={disabled ? colors.ink3 : colors.accentInk} />`
  - When pressed: `transform: [{ scale: motion.pressScale }]`
- `replyChip`: `paddingHorizontal: space.s3`, `height: 28`, `paddingVertical: 0`.

**`compose.tsx`**

- `body`: `{ padding: space.s4, gap: space.s4 }`.
- The final submit `Button` gets `size="lg"`.
- `imagePreview`: `borderRadius: radius.lg`, 180×180.
- `imageRemoveBtn`: `backgroundColor: colors.surface`, `boxShadow: shadow.xs`. Remove its border.
- `mapWrap`: `borderRadius: radius.lg`, `overflow: 'hidden'`.

**`components/forms/*`, `location.tsx`, `report.tsx`**

- Tokens only. In `location.tsx`, use `body` gap `space.s4`.

### WP4 — Communities and Search (`app/(tabs)/communities.tsx`, `app/(tabs)/search.tsx`, `components/community/*`, `app/community/**`)

**`(tabs)/communities.tsx`**

- Header: `<Header large title="Communities" right={<IconButton name="plus" … />} />`. Drop `wordmark`.
- `mineChip`:

```ts
{
  width: 160,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.lg,
  padding: space.s3,
  gap: 6,
  backgroundColor: colors.surface,
  boxShadow: shadow.xs,
}
```

  Its content is `<Avatar name={item.name} size={36} shape="rounded" />`, then the name (`variant="body"`, `fontWeight: '600'`, 1 line), then the members meta.
- `mineRow`: `gap: space.s3`, `paddingBottom: space.s1`.
- `filterRow`: `paddingVertical: space.s3`.
- Skeletons: `height={84} radius={radius.lg}`.
- `listContent`: `paddingTop: space.s1`.

**`CommunityCard.tsx`**

- The row starts with `<Avatar name={community.name} size={48} shape="rounded" />`.
- `row` gap: `space.s3`.
- The buttons are unchanged.

**`CommunityHeader.tsx`**

- `wrap`: `{ padding: space.s4, gap: space.s3 }`.
- Top block: `{ flexDirection: 'row', alignItems: 'center', gap: space.s4 }`. It contains `<Avatar name={community.name} size={64} shape="rounded" />` and a column `{ flex: 1, gap: 2 }` holding the title (`variant="title"`), the category · area line (secondary) and the members meta.
- The actions `row` is unchanged.
- The notify Pressable: `{ height: 32, paddingHorizontal: space.s3, borderRadius: radius.pill, backgroundColor: community.my_notify_posts ? colors.accentSoft : colors.surface2 }`.

**`community/[slug]/index.tsx`, `edit.tsx`, `members.tsx`, `community/new.tsx`**

- Tokens only.
- In `index.tsx`: `mapWrap` gets `borderRadius: radius.lg` and `overflow: 'hidden'`; skeletons use `radius={radius.lg}`.

**`(tabs)/search.tsx`**

- `<Header large title="Search" />`.
- `searchBar`: `paddingTop: space.s1`.
- `tabsRow`: `paddingTop: space.s1`.
- Skeletons: `height={84} radius={radius.lg}`.
- `UserResultRow` Avatar size 44.

### WP5 — Inbox and Chat (`app/(tabs)/inbox.tsx`, `app/chat/[id].tsx`, `components/chat/*`, `components/notifications/*`)

**`(tabs)/inbox.tsx`**

- `<Header large title="Inbox" right={…unchanged…} />`.
- `segmentWrap`: `{ paddingHorizontal: space.s4, paddingTop: space.s1, paddingBottom: space.s3 }`.
- `list`: `paddingBottom: space.s7`.

**`ConversationRow.tsx`**

- Avatar 48.
- `row`: `{ gap: 14, paddingVertical: space.s3, minHeight: 72 }`.
- Name: `fontWeight: '600'`, or `'700'` when unread.
- Time: meta. When unread: `{ color: colors.accent, fontWeight: '600' }`.
- Preview: secondary `ink2`. When unread: `{ color: colors.ink, fontWeight: '600' }`.
- `pill`: `{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.accent }`.
- `pillText`: `{ color: colors.accentInk, fontSize: 11, lineHeight: 14, fontWeight: '700' }`.

**`NotificationRow.tsx`**

- `iconWrap`: 40×40, pill. Read: `surface2` background with an `ink2` icon. Unread: `colors.accentSoft` background with a `colors.accent` icon.
- `row`: `paddingVertical: space.s3`.
- The unread dot is unchanged.

**`MessageBubble.tsx`**

```ts
row: { flexDirection: 'row', paddingHorizontal: space.s3, paddingVertical: 2 },
bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: radius.xs },
bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: radius.xs },
textMine: { color: colors.accentInk },
timeMine: { alignSelf: 'flex-end', color: colors.accentInk, opacity: 0.72 },
time: { alignSelf: 'flex-end', color: colors.ink3 },
heldText: { color: colors.ink3, fontStyle: 'italic' },
heldMine: { color: colors.accentInk, opacity: 0.8, fontStyle: 'italic' },
systemBubble: { maxWidth: '90%', backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: space.s3, paddingVertical: space.s2, gap: 2 },
```

- Body: `style={[mine ? styles.textMine : null, held ? (mine ? styles.heldMine : styles.heldText) : null]}`.
- Time: `style={mine ? styles.timeMine : styles.time}`.

**`chat/[id].tsx`**

- `list`: `{ paddingVertical: space.s3, paddingHorizontal: space.s1, flexGrow: 1, justifyContent: 'flex-end' }`.
- Nothing else changes.

**`RequestBar.tsx`**

- `wrap`: `{ backgroundColor: colors.surface, padding: space.s3, gap: space.s2, justifyContent: 'center' }`. Keep the hairline top border.

### WP6 — Profile and Settings (`app/(tabs)/profile.tsx`, `app/user/[username].tsx`, `app/profile/edit.tsx`, `components/profile/*`, `app/settings/*`)

**`(tabs)/profile.tsx`** (`user/[username].tsx` gets the same treatment)

- `<Header large title="Profile" right={…unchanged…} />`. Only in the tab; the user page keeps its back-button header.
- Wrap the Avatar in `<View style={styles.avatarRing}>`: `{ padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface, boxShadow: shadow.card }`. The Avatar becomes `size={96}`.
- `header`: `{ alignItems: 'center', gap: 6, paddingHorizontal: space.s4, paddingTop: space.s2, paddingBottom: space.s4 }`.
- Name: `variant="title"`.
- Bio: `{ textAlign: 'center', maxWidth: 480 }`.
- The area line becomes a row: `<Icon name="pin" size={12} color={colors.ink3} />` followed by the meta text.
- `actionsRow`: `marginTop: space.s3`.
- Delete the `<Divider />` above the Segmented.
- `segmentWrap`: `paddingTop: space.s5`.
- `answerRow`:

```ts
{
  gap: 6,
  padding: space.s4,
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.line,
}
```

  Remove the bottom border. The post title Text becomes `variant="secondary"` with `{ color: colors.ink, fontWeight: '600' }`.

**`StatsRow.tsx`**

```ts
stats: {
  flexDirection: 'row',
  marginHorizontal: space.s4,
  paddingVertical: space.s4,
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.line,
  boxShadow: shadow.xs,
},
statCell: { flex: 1, alignItems: 'center', gap: 2 },
// value: <Text variant="headline" numeric>
// label: <Text variant="meta" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 11 }}>
```

**`BadgeList.tsx`**

- Tokens only. The badges render through the new Badge.

**`settings/index.tsx`**

- `<Header large title="Settings" left={…unchanged…} />`.
- Every group becomes `<SectionTitle title="…" />` followed by `<ListGroup>…ListRows…</ListGroup>`. Delete all `<Divider />`s.
- The admin block becomes `<SectionTitle title="Admin" /><ListGroup><ListRow …/></ListGroup>`.
- Danger zone: `<View style={styles.dangerZone}><ListGroup><ListRow title={signOut} …/><ListRow title={deleteAccount} destructive …/></ListGroup></View>`.
- `dangerZone`: `{ paddingTop: space.s5, paddingBottom: space.s7 }`.

**Other `settings/*.tsx` and `profile/edit.tsx`**

- Use `<Header large title=… left=… />` wherever a header title exists. Otherwise, tokens only.

### WP7 — Auth and Onboarding (`app/welcome.tsx`, `sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `onboarding.tsx`, `guidelines.tsx`, `auth/callback.tsx`, `+not-found.tsx`, `app/index.tsx`)

**`welcome.tsx`** — replaces the `Wordmark` import with `Logo`, `RadarRings` and `Text`:

```tsx
<Screen>
  <View style={styles.wrap}>
    <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`${copy.wordmark}, ${copy.tagline}`}>
      <RadarRings size={240} pulse>
        <Logo size={64} />
      </RadarRings>
      <View style={styles.heroText}>
        <Text variant="hero">{copy.wordmark}</Text>
        <Text variant="bodyLg">{copy.tagline}</Text>
      </View>
    </View>
    <View style={styles.actions}>
      {/* same three buttons, same order/handlers; Google + email get size="lg" */}
    </View>
    {/* guidelines link unchanged */}
  </View>
</Screen>
// styles
wrap: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.s5, paddingTop: space.s6, paddingBottom: space.s5 },
hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s5 },
heroText: { alignItems: 'center', gap: space.s1 },
actions: { gap: space.s3, marginBottom: space.s4, width: '100%', maxWidth: 420, alignSelf: 'center' },
```

**`sign-in.tsx`, `sign-up.tsx` (both states), `forgot-password.tsx`, `reset-password.tsx`, `onboarding.tsx`**

- Add `large` to the existing `<Header title=… left=… />`. Keep the props unchanged.
- Form container: `{ paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4 }`, plus `width: '100%'`, `maxWidth: 480` and `alignSelf: 'center'` so it stays narrow on web. In onboarding this applies to `body`; `section` gets `gap: space.s4`.
- The primary submit Button in each form gets `size="lg"`.

**`guidelines.tsx`, `+not-found.tsx`, `auth/callback.tsx`, `app/index.tsx`**

- Tokens only. `guidelines.tsx` uses `large` if it has a header title.

### Admin (`app/admin/**`)

- Do not touch. It inherits the tokens.

---

## 7. Work packages

Each package owns its files exclusively. WP1 must be merged and pass `npm run typecheck` before WP2–WP7 start. WP2–WP7 can then run in parallel. They only consume WP1 primitives and never edit each other's files.

| WP | Scope | Files (all under `mobile/`) |
|---|---|---|
| **WP1** | Foundation | `package.json`, `package-lock.json` (via `npx expo install expo-font @expo-google-fonts/plus-jakarta-sans`), `app.config.ts`, `src/theme/tokens.ts`, `src/theme/fonts.ts` (new), `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/components/ui/*` (AvailabilityHint, Avatar, Badge, Banner, Button, Card, Chip, EmptyState, Header, Icon, IconButton, ListRow, RingDivider, SearchInput, SectionTitle, Segmented, Sheet, Skeleton, Text, TextField, Wordmark; new `RadarRings.tsx`, `ListGroup.tsx`), `src/providers/ToastProvider.tsx`, `src/providers/ActionSheetProvider.tsx` |
| **WP2** | Home feed | `src/app/(tabs)/index.tsx`, `src/components/post/{PostCard,TypeLabel,VoteButton,ReactionBar,PostStatusLine,AlertMini,AlertsStrip,DateBlock,FeedList}.tsx`, `src/components/map/*` |
| **WP3** | Post detail, comments, compose | `src/app/post/[id]/index.tsx`, `src/app/post/[id]/thread/[commentId].tsx`, `src/components/comments/*`, `src/components/post/{ShareRow,PhoneReveal,PostActions}.tsx` (tokens only), `src/app/compose.tsx`, `src/components/forms/*`, `src/app/location.tsx`, `src/app/report.tsx` |
| **WP4** | Communities and search | `src/app/(tabs)/communities.tsx`, `src/app/(tabs)/search.tsx`, `src/components/community/*`, `src/app/community/**` |
| **WP5** | Inbox and chat | `src/app/(tabs)/inbox.tsx`, `src/app/chat/[id].tsx`, `src/components/chat/*`, `src/components/notifications/*` |
| **WP6** | Profile and settings | `src/app/(tabs)/profile.tsx`, `src/app/user/[username].tsx`, `src/app/profile/edit.tsx`, `src/components/profile/*`, `src/app/settings/*` |
| **WP7** | Auth and onboarding | `src/app/{welcome,sign-in,sign-up,forgot-password,reset-password,onboarding,guidelines,+not-found,index}.tsx`, `src/app/auth/callback.tsx` |

Cross-package contracts that WP1 must deliver exactly as named:

- `Header` prop `large`
- `Button` size `'lg'`
- `Avatar` prop `shape`
- `ListRow` prop `destructive`
- `Icon` prop `strokeWidth`
- `EmptyState` prop `icon`
- New `ListGroup` and `RadarRings` components
- Tokens: `colors.{raised,onInk,accentPressed,accentTint,accentInverse,focusRing,alertSoft,alertTint,alertLine,eventSoft,success,successSoft}`, `typeSoft`, `avatarTones`, `shadow.{xs,card,fab,popover}`, `motion.*`, `font.*`, text variants `fieldLabel`, `button`, `bodyLg`, `headline`, `display`, `hero`, `radius.{xs,xl}`, `space.{s7,s8}`

---

## 8. Constraints and verification

- **Dependencies:** the only additions are `expo-font` (already in the tree transitively; this makes it direct) and `@expo-google-fonts/plus-jakarta-sans`. No reanimated imports, no gradients library, no icon packs, no blur.
- **TypeScript:** `cd mobile && npm run typecheck` must pass after each WP.
- **No hex literals outside tokens.ts:** `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba\(" mobile/src | grep -v theme/tokens.ts` must return nothing.
- **Web:** `npx expo start --web`. Check welcome, the feed (list and map), a post, compose, communities, inbox, a chat, profile and settings. Text must be in Jakarta with no doubled-bold headings, and inputs must show no blue browser outline. Run the same check with OS dark mode enabled after a reload.
- **Native:** in Expo Go or a dev build, check light and dark. The status bar flips correctly, the tab bar keeps its safe-area inset, and shadows render on Android.
- **Behavior:** routes, handlers, query hooks, accessibility labels and copy strings stay as they are. The only exceptions are the cosmetic changes called out in this spec: field labels no longer uppercase, the PostCard tag loses its `·` prefix, and header titles move into the large title row.

---

## 9. Summary

"Radar" re-skins pincode with:

- warm paper neutrals and white cards with soft shadows
- one iris accent, with a coral pin kept as the logo
- amber and green type pills for Alert and Event
- Plus Jakarta Sans with a stronger type scale
- pill-shaped controls
- concentric rings as the brand motif on welcome, empty states and feed dividers
- large-title headers on tab roots and auth screens
- a dark mode picked from the OS at launch, which needs no refactor because `tokens.ts` chooses the palette when it loads

Almost all of it flows from `tokens.ts` and the `ui/` primitives (WP1). WP2–WP7 are small, disjoint per-screen polish passes that can run in parallel.
