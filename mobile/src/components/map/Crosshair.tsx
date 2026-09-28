import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/tokens';
import { copy } from '@/lib/copy';

export type CrosshairProps = {
  visible: boolean;
  onConfirm: () => void;
};

// Fixed center crosshair overlay for pin-drop mode, plus the "Post here"
// button, shared by PostsMap.native.tsx and PostsMap.tsx (MOBILE-PLAN.md §7.5).
export function Crosshair({ visible, onConfirm }: CrosshairProps) {
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={styles.center}>
        <Icon name="crosshair" size={28} color={colors.accent} />
      </View>
      <View pointerEvents="box-none" style={styles.button}>
        <Button label={copy.feed.postHere} onPress={onConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -14,
    marginTop: -14,
  },
  button: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
