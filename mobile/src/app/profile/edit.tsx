import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { ListRow } from '@/components/ui/ListRow';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { useToast } from '@/providers/ToastProvider';
import { useUpdateProfile, useUploadAvatar } from '@/hooks/useProfile';
import { setHomeLocation } from '@/api/profiles';
import { INTERESTS } from '@/lib/constants';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

const MAX_INTERESTS = 15;

// The form copies your current profile into its fields when it first appears, so it must not
// appear before the profile has loaded (a cold-start deep link opens this screen first):
// empty fields saved would blank your name and bio.
export default function EditProfile() {
  const { me } = useAuth();
  if (!me) return null;
  return <EditProfileForm />;
}

function EditProfileForm() {
  const router = useRouter();
  const toast = useToast();
  const { me, refreshMe } = useAuth();
  const location = useLocation();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const [displayName, setDisplayName] = useState(me?.profile.display_name ?? '');
  const [bio, setBio] = useState(me?.profile.bio ?? '');
  const [interests, setInterests] = useState<string[]>(me?.profile.interests ?? []);
  const [homeArea, setHomeAreaField] = useState(me?.profile.home_area ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (location.status === 'granted') setHomeAreaField(location.area);
  }, [location.status, location.area]);

  if (!me) return null;

  const pickAvatar = async () => {
    // No permission request: launchImageLibraryAsync uses the system Photo Picker,
    // which needs none (and Play restricts broad READ_MEDIA_* permissions).
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      await uploadAvatar.mutateAsync(result.assets[0].uri);
      toast.show('Avatar updated.');
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  const toggleInterest = (value: string) => {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : prev.length < MAX_INTERESTS ? [...prev, value] : prev
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ display_name: displayName.trim(), bio: bio.trim(), interests });
      if (location.status === 'granted' && homeArea === location.area) {
        await setHomeLocation({
          lat: location.lat,
          lng: location.lng,
          pincode: location.pincode,
          area: location.area,
          city: location.city,
        });
        await refreshMe(); // home area lives on the profile row, which updateProfile already refreshed
      }
      toast.show('Profile updated.');
      goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Header large title="Edit profile" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <View style={styles.avatarRow}>
          <Avatar uri={me.profile.avatar_url} name={me.profile.display_name} size={72} />
          <Button
            label="Change photo"
            variant="ghost"
            size="sm"
            icon="camera"
            onPress={pickAvatar}
            loading={uploadAvatar.isPending}
          />
        </View>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={50} />
        <TextField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          maxLength={300}
          multiline
          hint={`${bio.length}/300`}
        />

        <SectionTitle flush title="Interests" />
        <ChipRow flush scroll={false}>
          {INTERESTS.map((i) => (
            <Chip key={i} label={i} selected={interests.includes(i)} onPress={() => toggleInterest(i)} />
          ))}
        </ChipRow>

        <SectionTitle flush title="Home area" />
        <Text variant="secondary">{homeArea || 'Not set'}</Text>
        <Button
          label={copy.location.useCurrent}
          variant="ghost"
          size="sm"
          onPress={() => location.useCurrentLocation()}
          loading={location.status === 'loading'}
        />

        <Button label={copy.common.save} onPress={save} loading={saving} />

        <SectionTitle flush title="Account" />
        <ListRow
          title="Change username"
          subtitle={me.profile.username ? `@${me.profile.username}` : undefined}
          chevron
          onPress={() => router.push('/settings/username')}
        />
        <ListRow
          title="Change phone"
          subtitle={me.private.phone_e164 ?? undefined}
          chevron
          onPress={() => router.push('/settings/phone')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
  avatarRow: { alignItems: 'center', gap: space.s2, marginBottom: space.s2 },
});
