import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { colors, space } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.wrap}>
        <Text variant="title">This page doesn't exist</Text>
        <Link href="/" style={styles.link}>
          <Text variant="body" style={styles.linkText}>
            Go to home
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: space.s4,
    padding: space.s6,
  },
  link: { paddingVertical: space.s3 },
  linkText: { color: colors.accent, fontWeight: '600' },
});
