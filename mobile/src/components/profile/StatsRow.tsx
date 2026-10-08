import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, radius, shadow, space } from '@/theme/tokens';

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
          <Text variant="headline" numeric>
            {value}
          </Text>
          <Text variant="meta" numberOfLines={1} adjustsFontSizeToFit style={styles.statLabel}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    marginHorizontal: space.s4,
    paddingVertical: space.s4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    boxShadow: shadow.xs,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 11 },
});
