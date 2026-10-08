import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AvailabilityHint, AvailabilityState } from '@/components/ui/AvailabilityHint';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Segmented } from '@/components/ui/Segmented';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import LocationPickerMap from '@/components/map/LocationPickerMap';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { useToast } from '@/providers/ToastProvider';
import { useCanCreateCommunity, useCreateCommunity } from '@/hooks/useCommunities';
import * as communitiesApi from '@/api/communities';
import { reverseGeocode } from '@/lib/location';
import { messageFor } from '@/lib/errors';
import { COMMUNITY_CATEGORIES } from '@/lib/constants';
import type { CommunityCategory } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import type { CommunityKind } from '@/types/models';
import { goBack } from '@/lib/nav';

const DEBOUNCE_MS = 400;
const RADII_CHIPS = [1, 2, 3, 5, 10] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Create-community modal (MOBILE-PLAN.md §4 Community new). Calls
// can_create_community() first and shows the eligibility checklist when the
// user isn't eligible — the RPC enforces the rule server-side regardless.
export default function CommunityNew() {
  const router = useRouter();
  const toast = useToast();
  const location = useLocation();
  const { session } = useAuth();

  const { data: eligibility, isLoading: eligibilityLoading } = useCanCreateCommunity();
  const createMutation = useCreateCommunity();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<AvailabilityState>('idle');
  const [kind, setKind] = useState<CommunityKind>('area');
  const [category, setCategory] = useState<CommunityCategory>('area');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<string[]>(['']);
  const [pin, setPin] = useState({ lat: location.lat, lng: location.lng });
  const [placeArea, setPlaceArea] = useState(location.area);
  const [placePincode, setPlacePincode] = useState<string | null>(location.pincode);
  const [placeCity, setPlaceCity] = useState(location.city);
  const [radiusKm, setRadiusKm] = useState<(typeof RADII_CHIPS)[number]>(3);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  useEffect(() => {
    const value = slug.trim();
    if (!value) {
      setSlugState('idle');
      return;
    }
    if (!SLUG_RE.test(value)) {
      setSlugState('invalid');
      return;
    }
    setSlugState('checking');
    const t = setTimeout(async () => {
      try {
        const available = await communitiesApi.slugAvailable(value);
        setSlugState(available ? 'ok' : 'taken');
      } catch {
        setSlugState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [slug]);

  const handlePinChange = (lat: number, lng: number) => {
    setPin({ lat, lng });
    reverseGeocode(lat, lng).then((geo) => {
      setPlaceArea(geo.area);
      setPlacePincode(geo.pincode);
      setPlaceCity(geo.city);
    });
  };

  const handleAddRule = () => {
    if (rules.length < 10) setRules((r) => [...r, '']);
  };
  const handleRuleChange = (i: number, value: string) => setRules((r) => r.map((x, idx) => (idx === i ? value : x)));
  const handleRemoveRule = (i: number) => setRules((r) => r.filter((_, idx) => idx !== i));

  const nameValid = name.trim().length >= 3 && name.trim().length <= 60;
  const canSubmit = nameValid && slugState === 'ok' && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const cleanRules = rules.map((r) => r.trim()).filter(Boolean);
      const newSlug = await createMutation.mutateAsync({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        rules: cleanRules,
        kind,
        category,
        lat: pin.lat,
        lng: pin.lng,
        radiusKm,
        pincode: placePincode,
        area: placeArea,
        city: placeCity,
      });
      router.replace(`/community/${newSlug}`);
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  const slugMessage =
    slugState === 'checking'
      ? copy.onboarding.checking
      : slugState === 'ok'
        ? copy.onboarding.available
        : slugState === 'taken'
          ? copy.onboarding.taken
          : slugState === 'invalid'
            ? copy.communities.slugHint
            : slugState === 'error'
              ? copy.onboarding.checkFailed
              : '';

  if (!session) {
    return (
      <Screen>
        <Header left={<IconButton name="x" label={copy.common.cancel} onPress={() => goBack()} />} />
        <EmptyState
          title={copy.communities.signInRequired}
          text={copy.communities.signInToStart}
          actions={<Button label={copy.auth.continueWithEmail} onPress={() => router.replace('/welcome')} />}
        />
      </Screen>
    );
  }

  if (eligibilityLoading) {
    return (
      <Screen>
        <Header left={<IconButton name="x" label={copy.common.cancel} onPress={() => goBack()} />} />
      </Screen>
    );
  }

  if (eligibility && !eligibility.allowed) {
    const extraReasons = eligibility.reasons.filter((r) => r !== 'reputation' && r !== 'account_age');
    return (
      <Screen scroll>
        <Header
          title={copy.communities.startCommunity}
          left={<IconButton name="x" label={copy.common.cancel} onPress={() => goBack()} />}
        />
        <View style={styles.body}>
          <EmptyState title={copy.communities.notEligibleTitle} text={copy.communities.notEligibleText} />
          <View style={styles.checklist}>
            <Text variant="body">
              {copy.communities.eligibility.reputation(eligibility.reputation, eligibility.required_reputation)}
            </Text>
            <Text variant="body">
              {copy.communities.eligibility.accountAge(eligibility.account_age_days, eligibility.required_age_days)}
            </Text>
            {extraReasons.map((r) => (
              <Text key={r} variant="body">
                {copy.communities.eligibility.reasons[r] ?? r}
              </Text>
            ))}
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header
        title={copy.communities.startCommunity}
        left={<IconButton name="x" label={copy.common.cancel} onPress={() => goBack()} />}
      />
      <View style={styles.body}>
        <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
        <TextField
          label="Slug"
          value={slug}
          onChangeText={(v) => {
            setSlugEdited(true);
            setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
          }}
          autoCapitalize="none"
          maxLength={40}
        />
        <AvailabilityHint state={slugState} message={slugMessage} />

        <View style={styles.section}>
          <SectionTitle flush title="Kind" />
          <Segmented
            options={[
              { value: 'area', label: 'Area' },
              { value: 'interest', label: 'Interest' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as CommunityKind)}
            full
          />
        </View>

        <View style={styles.section}>
          <SectionTitle flush title="Category" />
          <ChipRow flush>
            {COMMUNITY_CATEGORIES.map((c) => (
              <Chip key={c.code} label={c.label} selected={category === c.code} onPress={() => setCategory(c.code)} />
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

        <View style={styles.section}>
          <SectionTitle flush title={copy.communities.center} />
          <Text variant="secondary">{[placeArea, placePincode].filter(Boolean).join(' · ')}</Text>
          <View style={styles.mapWrap}>
            <LocationPickerMap lat={pin.lat} lng={pin.lng} onChange={handlePinChange} height={220} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle flush title={copy.communities.radius} />
          <ChipRow flush scroll={false}>
            {RADII_CHIPS.map((r) => (
              <Chip key={r} label={`${r} km`} selected={radiusKm === r} onPress={() => setRadiusKm(r)} />
            ))}
          </ChipRow>
        </View>

        <Button label={copy.communities.startCommunity} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
  section: { gap: space.s2 },
  checklist: { gap: space.s2, paddingHorizontal: space.s4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  ruleField: { flex: 1 },
  mapWrap: { height: 220 },
});
