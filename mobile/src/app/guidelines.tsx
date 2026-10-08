import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Be a good neighbor',
    body: 'Treat people the way you would in person. Be kind, be patient, and assume good faith.',
  },
  {
    title: 'Keep it local',
    body: 'Posts should be relevant to your neighborhood — asks, offers, alerts and events nearby.',
  },
  {
    title: 'No hate or harassment',
    body: 'Content that targets or demeans a person or group is not allowed.',
  },
  {
    title: 'No scams',
    body: 'Never share OTPs or pay a "registration fee". pincode will never ask for either. Report anything that looks like a scam.',
  },
  {
    title: 'No illegal activity',
    body: "Don't post anything unlawful, and don't use pincode to arrange it.",
  },
  {
    title: 'Respect privacy',
    body: "Don't share someone else's phone number, address or photos without their consent.",
  },
  {
    title: 'One account, real identity',
    body: "Don't impersonate someone else or create multiple accounts.",
  },
  {
    title: 'Moderation',
    body: 'Content may be reviewed automatically or by our team. Repeated violations lead to warnings, suspension, or a permanent ban.',
  },
];

export default function Guidelines() {
  return (
    <Screen scroll>
      <Header
        large
        title="Community guidelines"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.body}>
        {SECTIONS.map((s) => (
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
  section: { gap: space.s1 },
  text: { paddingHorizontal: space.s4, marginBottom: space.s3 },
});
