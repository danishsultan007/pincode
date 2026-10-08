import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { LEGAL_UPDATED, type LegalSection } from '@/lib/legal';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

// Shared layout for the public Terms and Privacy pages (no sign-in needed).
export function LegalScreen({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <Screen scroll>
      <Header large title={title} left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <Text variant="meta" style={styles.updated}>
          Last updated {LEGAL_UPDATED}
        </Text>
        {sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <SectionTitle title={s.title} />
            <Text variant="body" style={styles.text}>
              {s.body}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.s6 },
  updated: { paddingHorizontal: space.s4, marginBottom: space.s3 },
  section: { gap: space.s1 },
  text: { paddingHorizontal: space.s4, marginBottom: space.s3 },
});
