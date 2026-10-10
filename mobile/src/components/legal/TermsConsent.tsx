import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, space } from '@/theme/tokens';

// "I'm 18+ and agree to the Terms and Privacy Policy" checkbox, with the two
// documents linked inline. Used on onboarding and on the accept-terms gate.
export function TermsConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I am 18 or older and agree to the Terms of Service and Privacy Policy"
        hitSlop={13}
        style={[styles.box, checked ? styles.boxOn : null]}
      >
        {checked ? <Icon name="check" size={14} color={colors.accentInk} strokeWidth={3} /> : null}
      </Pressable>
      <Text variant="bodySm" style={styles.label} onPress={() => onChange(!checked)}>
        I&apos;m 18 or older and agree to the{' '}
        <Text variant="bodySm" style={styles.link} onPress={() => router.push('/terms')}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text variant="bodySm" style={styles.link} onPress={() => router.push('/privacy')}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { flex: 1 },
  link: { color: colors.accent, textDecorationLine: 'underline' },
});
