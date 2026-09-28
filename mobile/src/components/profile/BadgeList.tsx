import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { space } from '@/theme/tokens';
import type { UserBadge } from '@/types/models';

export type BadgeListProps = {
  badges: UserBadge[];
};

// MOBILE-PLAN.md §4 Profile / Public profile — badges earned via
// award_badge() (first_answer, helper, trusted_neighbor, ...). Renders
// nothing when the profile has none yet.
export function BadgeList({ badges }: BadgeListProps) {
  if (!badges.length) return null;
  return (
    <>
      <SectionTitle title="Badges" />
      <View style={styles.row}>
        {badges.map((b) => (
          <Badge key={b.code} label={b.name} tone="accent" />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, paddingHorizontal: space.s4 },
});
