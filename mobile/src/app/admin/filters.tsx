import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Segmented } from '@/components/ui/Segmented';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Divider } from '@/components/ui/Divider';
import { useToast } from '@/providers/ToastProvider';
import { useAddFilterTerm, useFilterTerms, useTestFilter, useToggleFilterTerm } from '@/hooks/useAdmin';
import { messageFor } from '@/lib/errors';
import { colors, space } from '@/theme/tokens';
import type { FilterTerm } from '@/types/models';
import { goBack } from '@/lib/nav';

const CATEGORIES: FilterTerm['category'][] = ['slur', 'abuse', 'scam', 'spam', 'url', 'phone'];
const ACTION_OPTIONS: { value: FilterTerm['action']; label: string }[] = [
  { value: 'flag', label: 'Flag' },
  { value: 'block', label: 'Block' },
];
const SCOPES: FilterTerm['scopes'][number][] = ['post', 'comment', 'message', 'profile', 'community'];
const TEST_SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'post', label: 'Post' },
  { value: 'comment', label: 'Comment' },
  { value: 'message', label: 'Message' },
];

// Admin filters (MOBILE-PLAN.md §4 Admin filters): list with an active
// toggle, an add form, and "Test text" → admin_test_filter.
export default function AdminFilters() {
  const toast = useToast();
  const { data: terms, isLoading } = useFilterTerms();
  const toggleMutation = useToggleFilterTerm();
  const addMutation = useAddFilterTerm();
  const testMutation = useTestFilter();

  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState<FilterTerm['category']>('spam');
  const [action, setAction] = useState<FilterTerm['action']>('flag');
  const [scopes, setScopes] = useState<FilterTerm['scopes']>(['post', 'comment', 'message']);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const [testText, setTestText] = useState('');
  const [testScope, setTestScope] = useState('post');
  const [testResult, setTestResult] = useState<{ action: string; reasons: string[] } | null>(null);
  const [testing, setTesting] = useState(false);

  const toggleScope = (s: FilterTerm['scopes'][number]) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const handleAdd = async () => {
    if (!pattern.trim() || !scopes.length) return;
    setAdding(true);
    try {
      await addMutation.mutateAsync({ pattern: pattern.trim(), category, action, scopes, note: note.trim() || null });
      setPattern('');
      setNote('');
      toast.show('Filter term added.');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setAdding(false);
    }
  };

  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const result = await testMutation.mutateAsync({ text: testText, scope: testScope });
      setTestResult(result);
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen scroll edges={['top']}>
      <Header title="Filter terms" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <SectionTitle flush title="Test text" />
        <TextField value={testText} onChangeText={setTestText} placeholder="Paste text to test" multiline maxLength={2000} />
        <Segmented options={TEST_SCOPE_OPTIONS} value={testScope} onChange={setTestScope} />
        <Button label="Test" onPress={handleTest} loading={testing} disabled={!testText.trim()} />
        {testResult ? (
          <Text variant="body">
            Result: {testResult.action}
            {testResult.reasons.length ? ` (${testResult.reasons.join(', ')})` : ''}
          </Text>
        ) : null}

        <Divider />
        <SectionTitle flush title="Add filter term" />
        <TextField label="Pattern (regex)" value={pattern} onChangeText={setPattern} autoCapitalize="none" />
        <ChipRow flush>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </ChipRow>
        <Segmented options={ACTION_OPTIONS} value={action} onChange={setAction} full />
        <ChipRow flush>
          {SCOPES.map((s) => (
            <Chip key={s} label={s} selected={scopes.includes(s)} onPress={() => toggleScope(s)} />
          ))}
        </ChipRow>
        <TextField label="Note (optional)" value={note} onChangeText={setNote} />
        <Button label="Add" onPress={handleAdd} loading={adding} disabled={!pattern.trim() || !scopes.length} />

        <Divider />
        <SectionTitle flush title={`Terms (${terms?.length ?? 0})`} />
        {isLoading
          ? null
          : (terms ?? []).map((t) => (
              <View key={t.id} style={styles.termRow}>
                <View style={styles.termBody}>
                  <Text variant="bodySm" numberOfLines={2}>
                    {t.pattern}
                  </Text>
                  <Text variant="meta">
                    {t.category} · {t.action} · {t.scopes.join(', ')}
                  </Text>
                </View>
                <Switch
                  value={t.active}
                  onValueChange={(v) =>
                    toggleMutation.mutate({ id: t.id, active: v }, { onError: (err) => toast.show(messageFor(err)) })
                  }
                />
              </View>
            ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3, paddingBottom: space.s6 },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingVertical: space.s2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  termBody: { flex: 1, gap: 2 },
});
