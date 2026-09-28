import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { space } from '@/theme/tokens';

export type StatsRowProps = {
  reputation: number;
  posts: number;
  answers: number;
  solved: number;
  communities: number;
};

// MOBILE-PLAN.md §4 Profile: Reputation, Posts, Answers, Solved, Communities.
export function StatsRow({ reputation, posts, answers, solved, communities }: StatsRowProps) {
  const stats: [string, number][] = [
    ['Reputation', reputation],
    ['Posts', posts],
    ['Answers', answers],
    ['Solved', solved],
    ['Communities', communities],
  ];

  return (
    <View style={styles.stats}>
      {stats.map(([label, value]) => (
        <View key={label} style={styles.statCell}>
          <Text variant="cardTitle" numeric>
            {value}
          </Text>
          <Text variant="meta">{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.s4, paddingVertical: space.s3 },
  statCell: { width: '20%', alignItems: 'center', gap: 2, marginBottom: space.s2 },
});
