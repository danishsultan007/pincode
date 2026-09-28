import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { submitReport, markPostReportedLocally } from '@/api/moderation';
import { supabase } from '@/lib/supabase';
import { messageFor } from '@/lib/errors';
import { REPORT_CATEGORIES } from '@/lib/constants';
import type { ReportCategory } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import type { ReportTarget } from '@/types/models';
import { goBack } from '@/lib/nav';

// Report modal (MOBILE-PLAN.md §4 Report, §6 Moderation flow #2). Opened
// from PostActions/comment menu (targetType 'post'/'comment'), the profile
// screen and chat header menu (targetType 'user', optionally with
// conversationId), and the community overflow menu (targetType 'community').
// `userId` lets a caller whose target isn't itself a user id (a reported
// message) say who "Also block this user" should block.
type ReportParams = {
  targetType?: ReportTarget;
  targetId?: string;
  conversationId?: string;
  userId?: string;
};

export default function ReportModal() {
  const toast = useToast();
  const { user } = useAuth();
  const { targetType, targetId, conversationId, userId } = useLocalSearchParams<ReportParams>();

  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const showBlockOption = targetType === 'user' || targetType === 'message';
  const blockTargetId = userId ?? (targetType === 'user' ? targetId : undefined);

  const handleClose = () => goBack();

  const handleSubmit = async () => {
    if (!targetType || !targetId || !category) return;
    setSubmitting(true);
    try {
      await submitReport({
        targetType,
        targetId,
        category,
        details: details.trim() || null,
        conversationId: conversationId ?? null,
      });
      if (targetType === 'post') markPostReportedLocally(targetId);
      if (showBlockOption && alsoBlock && blockTargetId && user) {
        await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: blockTargetId });
      }
      toast.show(copy.report.submitted);
      goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!targetType || !targetId) {
    return (
      <Sheet title="Report" onClose={handleClose}>
        <Text variant="body" style={styles.emptyBody}>
          Nothing to report.
        </Text>
      </Sheet>
    );
  }

  return (
    <Sheet title="Report" onClose={handleClose}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.categoryList}>
          {REPORT_CATEGORIES.map((c) => {
            const selected = category === c.code;
            return (
              <Pressable
                key={c.code}
                onPress={() => setCategory(c.code)}
                style={[styles.categoryRow, selected ? styles.categoryRowSelected : null]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={styles.categoryText}>
                  <Text variant="body">{c.label}</Text>
                  <Text variant="meta">{c.description}</Text>
                </View>
                {selected ? <Icon name="check" color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>

        <TextField
          label={copy.report.detailsOptional}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={1000}
        />

        {showBlockOption ? (
          <View style={styles.switchRow}>
            <Text variant="body">{copy.report.alsoBlock}</Text>
            <Switch value={alsoBlock} onValueChange={setAlsoBlock} />
          </View>
        ) : null}

        <Button label="Submit" onPress={handleSubmit} loading={submitting} disabled={!category} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
  emptyBody: { padding: space.s4 },
  categoryList: { gap: 2 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s2,
    paddingVertical: space.s2,
    paddingHorizontal: space.s2,
    borderRadius: radius.sm,
  },
  categoryRowSelected: { backgroundColor: colors.accentSoft },
  categoryText: { flex: 1, gap: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
