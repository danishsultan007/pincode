import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type SheetProps = {
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
};

// A modal body wrapper: a drag handle, an optional title row with a close
// button, and the content. Used by every screen presented with
// `presentation: 'modal'` (compose, location, report, community/new), and by
// the plain-list fallback for lib/confirm.ts's actionSheet() on non-iOS.
export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.handle} />
      {title || onClose ? (
        <View style={styles.header}>
          <Text variant="cardTitle" style={styles.title}>
            {title}
          </Text>
          {onClose ? <IconButton name="x" label="Close" onPress={onClose} /> : null}
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flex: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.lineStrong,
    marginTop: space.s2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s4,
    paddingTop: space.s3,
    paddingBottom: space.s2,
  },
  title: { flex: 1 },
  content: { flex: 1 },
});
