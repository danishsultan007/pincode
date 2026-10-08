import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Logo } from './Logo';
import { copy } from '@/lib/copy';
import { colors, space } from '@/theme/tokens';

export type WordmarkProps = { size?: 'sm' | 'lg' };

// The shared logo + "pincode / your neighborhood" lockup, horizontal at both
// sizes (see UI-REDESIGN-PLAN.md §2): `sm` for headers (right-most, next to
// the logo mark), `lg` for the welcome hero.
export function Wordmark({ size = 'sm' }: WordmarkProps) {
  const sm = size === 'sm';
  return (
    <View
      style={[styles.row, { gap: sm ? 8 : space.s3 }]}
      accessibilityRole="header"
      accessibilityLabel={`${copy.wordmark}, ${copy.tagline}`}
    >
      <Logo size={sm ? 24 : 44} />
      <View style={styles.textCol}>
        <Text variant="wordmark" numberOfLines={1} style={sm ? styles.nameSm : styles.nameLg}>
          {copy.wordmark}
        </Text>
        {sm ? (
          <Text variant="meta" numberOfLines={1} style={styles.taglineSm}>
            {copy.tagline}
          </Text>
        ) : (
          <Text variant="secondary" numberOfLines={1}>
            {copy.tagline}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  // flexShrink: 0 here too — without it, react-native-web can still let this
  // column get squeezed by a flex:1 sibling (e.g. the header's search box),
  // wrapping "your neighborhood" onto its own broken line even though the
  // Text itself is numberOfLines={1}, since the wrap could happen because
  // the CONTAINER shrank under the text's natural width, not the text
  // itself overflowing.
  textCol: { flexShrink: 0 },
  nameSm: { fontSize: 18, lineHeight: 20 },
  nameLg: { fontSize: 34, lineHeight: 38 },
  taglineSm: { fontSize: 11, lineHeight: 13, color: colors.ink3 },
});
