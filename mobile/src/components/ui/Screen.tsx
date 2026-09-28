import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

export type ScreenProps = {
  scroll?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  children: React.ReactNode;
};

// On web the app can render in a full-width browser window, so content is
// centered in a capped column instead of stretching edge to edge like a
// native phone screen — feed cards and post text weren't designed to
// stretch across an ultrawide monitor. 960px (widened from the original
// 720px, MOBILE-PLAN.md §9 P9) meaningfully cuts the empty side margins on
// a typical laptop width while staying capped on wider monitors.
export function Screen({ scroll, edges = ['top', 'bottom'], children }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollOuter} keyboardShouldPersistTaps="handled">
          <View style={styles.center}>{children}</View>
        </ScrollView>
      ) : (
        <View style={styles.center}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scrollOuter: { flexGrow: 1 },
  center: Platform.select({
    web: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' },
    default: { flex: 1 },
  }),
});
