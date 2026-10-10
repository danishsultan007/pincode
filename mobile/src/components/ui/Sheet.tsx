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
// `presentation: 'modal'` (compose, location, report, community/new).
export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.handle} />
      {title || onClose ? (
        <View style={styles.header}>
          <Text variant="headline" style={styles.title}>
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
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flex: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.lineStrong,
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s5,
    paddingTop: space.s4,
    paddingBottom: space.s3,
  },
  title: { flex: 1 },
  content: { flex: 1 },
});
