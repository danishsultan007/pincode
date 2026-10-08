import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useToast } from '@/providers/ToastProvider';
import { useCommunity, useUpdateCommunity } from '@/hooks/useCommunities';
import { messageFor } from '@/lib/errors';
import { COMMUNITY_CATEGORIES } from '@/lib/constants';
import type { CommunityCategory } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { DetailState } from '@/components/ui/DetailState';
import { goBack } from '@/lib/nav';

const RADII_CHIPS = [1, 2, 3, 5, 10] as const;

// Community edit (mods): description/rules are open to any moderator; only
// the owner (or an admin) may change name/category/radius — update_community
// enforces this server-side, so non-owner fields are disabled here rather
// than hidden (MOBILE-PLAN.md §2.7).
export default function CommunityEdit() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const toast = useToast();

  const { data: community, isLoading, isError, refetch } = useCommunity(slug);
  const updateMutation = useUpdateCommunity(community?.id ?? '');

  const [name, setName] = useState('');
  const [category, setCategory] = useState<CommunityCategory>('area');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<string[]>(['']);
  const [radiusKm, setRadiusKm] = useState<(typeof RADII_CHIPS)[number]>(3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!community) return;
    setName(community.name);
    setCategory(community.category);
    setDescription(community.description);
    setRules(community.rules.length ? community.rules : ['']);
    setRadiusKm((RADII_CHIPS.find((r) => r === Math.round(community.radius_km)) ?? 3) as (typeof RADII_CHIPS)[number]);
  }, [community]);

  if (isLoading) return <DetailState kind="loading" />;
  if (isError) return <DetailState kind="error" onRetry={() => refetch()} />;
  if (!community) return <DetailState kind="notFound" text={"This community isn't available."} />;

  const isMod = community.my_role === 'owner' || community.my_role === 'moderator';
  if (!isMod) return <Redirect href={`/community/${slug}`} />;

  const isOwner = community.my_role === 'owner';

  const handleAddRule = () => {
    if (rules.length < 10) setRules((r) => [...r, '']);
  };
  const handleRuleChange = (i: number, value: string) => setRules((r) => r.map((x, idx) => (idx === i ? value : x)));
  const handleRemoveRule = (i: number) => setRules((r) => r.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        rules: rules.map((r) => r.trim()).filter(Boolean),
        category,
        radiusKm,
      });
      toast.show(copy.common.save);
      goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Header title={copy.communities.editCommunity} left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        {isOwner ? (
          <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
        ) : (
          <View style={styles.section}>
            <SectionTitle flush title="Name" />
            <Text variant="body">{name}</Text>
          </View>
        )}

        <View style={styles.section}>
          <SectionTitle flush title="Category" />
          <ChipRow flush>
            {COMMUNITY_CATEGORIES.map((c) => (
              <Chip
                key={c.code}
                label={c.label}
                selected={category === c.code}
                onPress={() => isOwner && setCategory(c.code)}
              />
            ))}
          </ChipRow>
        </View>

        <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={1000} />

        <View style={styles.section}>
          <SectionTitle flush
            title={copy.communities.rules}
            right={rules.length < 10 ? <Button label="+ Add" size="sm" variant="text" onPress={handleAddRule} /> : undefined}
          />
          {rules.map((rule, i) => (
            <View key={i} style={styles.ruleRow}>
              <View style={styles.ruleField}>
                <TextField value={rule} onChangeText={(v) => handleRuleChange(i, v)} placeholder={`Rule ${i + 1}`} maxLength={200} />
              </View>
              {rules.length > 1 ? <IconButton name="x" label="Remove rule" onPress={() => handleRemoveRule(i)} /> : null}
            </View>
          ))}
        </View>

        {isOwner ? (
          <View style={styles.section}>
            <SectionTitle flush title={copy.communities.radius} />
            <ChipRow flush scroll={false}>
              {RADII_CHIPS.map((r) => (
                <Chip key={r} label={`${r} km`} selected={radiusKm === r} onPress={() => setRadiusKm(r)} />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <Button label={copy.common.save} onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
  section: { gap: space.s2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  ruleField: { flex: 1 },
});
