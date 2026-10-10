import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AvailabilityHint, AvailabilityState } from '@/components/ui/AvailabilityHint';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Button } from '@/components/ui/Button';
import { TermsConsent } from '@/components/legal/TermsConsent';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { useToast } from '@/providers/ToastProvider';
import { acceptTerms, completeOnboarding, phoneAvailable, suggestUsernames, usernameAvailable } from '@/api/profiles';
import { isReservedUsername, isValidUsername } from '@/lib/username';
import { normalizeIndianPhone } from '@/lib/phone';
import { PINCODES } from '@/lib/pincodes';
import { INTERESTS } from '@/lib/constants';
import { TERMS_VERSION } from '@/lib/legal';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';

const STEP_TITLES = ['About you', 'Phone number', 'Area and interests'];
const DEBOUNCE_MS = 400;
const MAX_INTERESTS = 15;

export default function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, me } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (me?.profile.onboarded_at) router.replace('/(tabs)');
  }, [me, router]);

  const [step, setStep] = useState(0);

  const [displayName, setDisplayName] = useState(
    () => (user?.user_metadata?.full_name as string | undefined) || (user?.user_metadata?.name as string | undefined) || ''
  );
  const [username, setUsername] = useState('');
  const [usernameState, setUsernameState] = useState<AvailabilityState>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneState, setPhoneState] = useState<AvailabilityState>('idle');

  const [homeArea, setHomeArea] = useState('');
  const [homePincode, setHomePincode] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');

  const [submitting, setSubmitting] = useState(false);
  // Consent is collected once, on the last step (covers email and Google sign-ups).
  const alreadyAccepted = me?.private.terms_version === TERMS_VERSION;
  const [agreed, setAgreed] = useState(false);
  const canFinish = alreadyAccepted || agreed;

  const loadSuggestions = async () => {
    try {
      const hint = homeArea || displayName;
      const list = await suggestUsernames(hint, 6);
      setSuggestions(list);
    } catch {
      // ignore — the field still works without suggestions
    }
  };

  useEffect(() => {
    loadSuggestions();
    // Only on mount: re-fetching would refresh chips out from under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setUsernameState('idle');
      return;
    }
    if (!isValidUsername(value)) {
      setUsernameState('invalid');
      return;
    }
    if (isReservedUsername(value)) {
      setUsernameState('reserved');
      return;
    }
    setUsernameState('checking');
    const t = setTimeout(async () => {
      try {
        const available = await usernameAvailable(value);
        setUsernameState(available ? 'ok' : 'taken');
      } catch {
        setUsernameState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [username]);

  useEffect(() => {
    if (phoneDigits.length !== 10) {
      setPhoneState('idle');
      return;
    }
    const normalized = normalizeIndianPhone(phoneDigits);
    if (!normalized) {
      setPhoneState('invalid');
      return;
    }
    setPhoneState('checking');
    const t = setTimeout(async () => {
      try {
        const available = await phoneAvailable(normalized);
        setPhoneState(available ? 'ok' : 'taken');
      } catch {
        setPhoneState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [phoneDigits]);

  useEffect(() => {
    if (step === 2 && location.status === 'granted') {
      setHomeArea(location.area);
      setHomePincode(location.pincode ?? '');
      setHomeCity(location.city);
      setLat(location.lat);
      setLng(location.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.status, step]);

  const lookupPincode = () => {
    const entry = PINCODES[homePincode];
    if (entry) {
      setHomeArea(entry.area);
      setHomeCity(entry.city);
      setLat(entry.lat);
      setLng(entry.lng);
    } else {
      toast.show("We don't recognize that pincode yet — you can still continue.");
    }
  };

  const toggleInterest = (value: string) => {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : prev.length < MAX_INTERESTS ? [...prev, value] : prev
    );
  };

  const addCustomInterest = () => {
    const value = customInterest.trim().toLowerCase();
    if (value && !interests.includes(value) && interests.length < MAX_INTERESTS) {
      setInterests((prev) => [...prev, value]);
    }
    setCustomInterest('');
  };

  const step1Valid = displayName.trim().length > 0 && usernameState === 'ok';
  const step2Valid = phoneState === 'ok';

  const finish = async () => {
    setSubmitting(true);
    try {
      if (!alreadyAccepted) await acceptTerms(TERMS_VERSION);
      await completeOnboarding({
        username: username.trim(),
        displayName: displayName.trim(),
        phone: phoneDigits,
        interests,
        homePincode: homePincode || null,
        homeArea: homeArea || null,
        homeCity: homeCity || null,
        lat,
        lng,
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/(tabs)');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  const usernameMessage =
    usernameState === 'checking'
      ? copy.onboarding.checking
      : usernameState === 'ok'
        ? copy.onboarding.available
        : usernameState === 'taken'
          ? copy.onboarding.taken
          : usernameState === 'reserved'
          ? copy.onboarding.reserved
          : usernameState === 'invalid'
            ? copy.onboarding.usernameHint
            : usernameState === 'error'
              ? copy.onboarding.checkFailed
              : '';

  const phoneMessage =
    phoneState === 'checking'
      ? copy.onboarding.checking
      : phoneState === 'ok'
        ? copy.onboarding.available
        : phoneState === 'taken'
          ? copy.onboarding.taken
          : phoneState === 'invalid'
            ? 'Enter a valid 10-digit mobile number'
            : phoneState === 'error'
              ? copy.onboarding.checkFailed
              : '';

  return (
    <Screen scroll>
      <Header
        large
        title={STEP_TITLES[step]}
        left={step > 0 ? <IconButton name="chevron-left" label="Back" onPress={() => setStep((s) => s - 1)} /> : undefined}
      />
      <View style={styles.body}>
        {step === 0 ? (
          <View style={styles.section}>
            <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={50} />
            <TextField
              label="Username"
              value={username}
              onChangeText={(v) => setUsername(v.replace(/\s/g, ''))}
              autoCapitalize="none"
              maxLength={20}
            />
            <AvailabilityHint state={usernameState} message={usernameMessage} />
            <SectionTitle flush
              title="Suggestions"
              right={<IconButton name="refresh" label="More suggestions" onPress={loadSuggestions} />}
            />
            <ChipRow flush>
              {suggestions.map((s) => (
                <Chip key={s} label={s} onPress={() => setUsername(s)} />
              ))}
            </ChipRow>
            <Button
              size="lg"
              label="Next"
              onPress={() => setStep(1)}
              disabled={!step1Valid}
              loading={usernameState === 'checking'}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.section}>
            <TextField
              label="Phone number"
              value={phoneDigits}
              onChangeText={(v) => setPhoneDigits(v.replace(/\D/g, '').slice(0, 10))}
              prefix="+91"
              keyboardType="number-pad"
              maxLength={10}
            />
            <AvailabilityHint state={phoneState} message={phoneMessage} />
            <Text variant="meta">{copy.onboarding.phoneNote}</Text>
            <Button size="lg" label="Next" onPress={() => setStep(2)} disabled={!step2Valid} />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.section}>
            <SectionTitle flush title="Home area" />
            <Button
              label={copy.location.useCurrent}
              variant="ghost"
              onPress={() => location.useCurrentLocation()}
              loading={location.status === 'loading'}
            />
            <TextField
              label="Pincode"
              value={homePincode}
              onChangeText={(v) => setHomePincode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              right={<Button label="Look up" size="sm" variant="text" onPress={lookupPincode} />}
            />
            {homeArea ? (
              <Text variant="secondary">
                {homeArea}
                {homeCity ? `, ${homeCity}` : ''}
              </Text>
            ) : null}

            <SectionTitle flush title="Interests" />
            <ChipRow flush scroll={false}>
              {INTERESTS.map((i) => (
                <Chip key={i} label={i} selected={interests.includes(i)} onPress={() => toggleInterest(i)} />
              ))}
            </ChipRow>
            <TextField
              label="Add your own"
              value={customInterest}
              onChangeText={setCustomInterest}
              placeholder="e.g. pottery"
              maxLength={24}
              right={<Button label="Add" size="sm" variant="text" onPress={addCustomInterest} />}
            />

            {alreadyAccepted ? null : <TermsConsent checked={agreed} onChange={setAgreed} />}
            <Button size="lg" label="Finish" onPress={finish} loading={submitting} disabled={!canFinish} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
  section: { gap: space.s4 },
});
