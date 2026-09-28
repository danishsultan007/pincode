import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from './Text';
import { Wordmark } from './Wordmark';
import { colors, space } from '@/theme/tokens';

export type HeaderProps = {
  title?: string;
  left?: React.ReactNode;
  // Flexible middle content (e.g. Home's search box). Only used in
  // `wordmark` mode; ignored otherwise (use `title` there instead).
  center?: React.ReactNode;
  right?: React.ReactNode;
  wordmark?: boolean;
};

// wordmark = lockup pinned left-most, right after `left` (a back button, or
// nothing on tab-root screens with no back button) — never centered, never
// on the right. Tapping it navigates to Home, like a site's logo usually
// does. `center` is the flexible middle slot (Home's search box); `right`
// is trailing actions (e.g. the location pill).
//
// `title` (e.g. "Sign in") is centered on the WHOLE row — the same center
// line as the page content below it — not on the leftover space next to the
// logo (that made it drift right, off-center from the form below it). It's
// laid over the row with `position: absolute` so `left` + the logo's width
// don't shift its center point at all.
export function Header({ title, left, center, right, wordmark }: HeaderProps) {
  if (wordmark) {
    return (
      <View style={styles.row}>
        {title ? (
          <View style={styles.titleOverlay} pointerEvents="none">
            <Text variant="cardTitle" numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        {left}
        <Pressable
          style={styles.markWrap}
          onPress={() => router.push('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
          hitSlop={8}
        >
          <Wordmark size="sm" />
        </Pressable>
        {center ? <View style={styles.centerWrap}>{center}</View> : <View style={styles.spacer} />}
        {right ? <View style={styles.actions}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.side}>{left}</View>
      <View style={styles.center}>
        {title ? (
          <Text variant="cardTitle" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: space.s4,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    position: 'relative',
  },
  side: { minWidth: 32, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  // Absolutely centered on the full row width — ignores `left`/logo/`right`
  // entirely, so it lines up with the centered page content below it.
  titleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markWrap: { flexShrink: 0, marginRight: space.s3 },
  // Takes up the row's remaining space when there's no `center` content, so
  // `right` still gets pushed to the true right edge (matching the
  // non-wordmark layout's spacing) even though the title itself no longer
  // lives in the normal flex flow.
  spacer: { flex: 1, minWidth: 0 },
  centerWrap: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.s2, marginLeft: space.s3, flexShrink: 1, minWidth: 0 },
});
