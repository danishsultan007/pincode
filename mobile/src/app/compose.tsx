import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Banner } from '@/components/ui/Banner';
import { TagPicker } from '@/components/forms/TagPicker';
import { DurationChips, durationMs } from '@/components/forms/DurationChips';
import { DateTimeChips } from '@/components/forms/DateTimeChips';
import LocationPickerMap from '@/components/map/LocationPickerMap';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { useToast } from '@/providers/ToastProvider';
import { useCreatePost, usePost, useUpdatePost, useUploadPostImage } from '@/hooks/usePost';
import { useMyCommunities } from '@/hooks/useCommunities';
import { reverseGeocode } from '@/lib/location';
import { normalizeIndianPhone } from '@/lib/phone';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { colors, radius, shadow, space } from '@/theme/tokens';
import type { PostKind, PostType } from '@/types/models';
import { goBack } from '@/lib/nav';

type ComposeParams = { type?: string; lat?: string; lng?: string; title?: string; id?: string; communityId?: string };

export default function Compose() {
  const router = useRouter();
  const params = useLocalSearchParams<ComposeParams>();
  const location = useLocation();
  const toast = useToast();
  const { me } = useAuth();

  // MOBILE-PLAN.md §6 Moderation flow #4: can_participate() is the source of
  // truth server-side; disable Submit and explain why instead of letting the
  // RLS error surface after the user has filled the whole form.
  const isSuspended =
    !!me &&
    (me.profile.ban_permanent || (!!me.profile.banned_until && new Date(me.profile.banned_until) > new Date()));

  const editId = params.id;
  const { data: editingPost } = usePost(editId);
  const createPost = useCreatePost();
  const updatePost = useUpdatePost(editId ?? '');
  const uploadPostImage = useUploadPostImage();
  const { data: myCommunitiesList } = useMyCommunities();

  const initialLat = params.lat ? Number(params.lat) : location.lat;
  const initialLng = params.lng ? Number(params.lng) : location.lng;

  const [type, setType] = useState<PostType>((params.type as PostType) || 'ask');
  const [kind, setKind] = useState<PostKind>('request');
  const [tag, setTag] = useState<string | null>(null);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [title, setTitle] = useState(params.title ?? '');
  const [body, setBody] = useState('');
  const [alertDuration, setAlertDuration] = useState<string | null>('3h');
  const [eventStart, setEventStart] = useState<Date | null>(null);
  const [eventDuration, setEventDuration] = useState<string | null>('2h');

  const [pin, setPin] = useState({ lat: initialLat, lng: initialLng });
  const [placeArea, setPlaceArea] = useState(location.area);
  const [placePincode, setPlacePincode] = useState<string | null>(location.pincode);
  const [placeCity, setPlaceCity] = useState(location.city);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(params.communityId ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!editId;

  useEffect(() => {
    if (!editingPost) return;
    setType(editingPost.type);
    setKind(editingPost.kind ?? 'request');
    setTag(editingPost.tag);
    setTitle(editingPost.title);
    setBody(editingPost.body);
    setPin({ lat: editingPost.lat, lng: editingPost.lng });
    setPlaceArea(editingPost.area ?? '');
    setPlacePincode(editingPost.pincode);
    setPlaceCity(editingPost.city ?? '');
    setCommunityId(editingPost.community_id);
    setImageUrl(editingPost.image_url);
  }, [editingPost]);

  useEffect(() => {
    if (params.lat && params.lng) {
      reverseGeocode(Number(params.lat), Number(params.lng)).then((geo) => {
        setPlaceArea(geo.area);
        setPlacePincode(geo.pincode);
        setPlaceCity(geo.city);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePinChange = (lat: number, lng: number) => {
    setPin({ lat, lng });
    reverseGeocode(lat, lng).then((geo) => {
      setPlaceArea(geo.area);
      setPlacePincode(geo.pincode);
      setPlaceCity(geo.city);
    });
  };

  const pickImage = async () => {
    // No permission request: launchImageLibraryAsync uses the system Photo Picker,
    // which needs none (and Play restricts broad READ_MEDIA_* permissions).
    // No allowsEditing/aspect here (unlike the avatar picker): cropping
    // flattens an animated GIF to a single frame, and posts shouldn't be
    // forced to a square anyway.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const url = await uploadPostImage.mutateAsync(result.assets[0].uri);
      setImageUrl(url);
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  const titleValid = title.trim().length >= 3 && title.trim().length <= 120;
  const eventValid = type !== 'event' || !!eventStart;
  const canSubmit = titleValid && eventValid && !submitting && !isSuspended && !uploadPostImage.isPending;

  const hint = copy.post.hint[type];
  const submitLabel = copy.post.submit[type];

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await updatePost.mutateAsync({
          title: title.trim(),
          body: body.trim(),
          tag: type === 'ask' ? tag : null,
          image_url: imageUrl,
        });
        router.replace(`/post/${editId}`);
        return;
      }

      const phone = type === 'ask' && phoneDigits ? normalizeIndianPhone(phoneDigits) : null;
      const now = Date.now();
      const starts_at = type === 'event' && eventStart ? eventStart.toISOString() : null;
      const ends_at =
        type === 'alert' && alertDuration
          ? new Date(now + durationMs(alertDuration)).toISOString()
          : type === 'event' && eventStart && eventDuration
            ? new Date(eventStart.getTime() + durationMs(eventDuration)).toISOString()
            : null;

      const result = await createPost.mutateAsync({
        type,
        kind: type === 'ask' ? kind : null,
        tag: type === 'ask' ? tag : null,
        title: title.trim(),
        body: body.trim(),
        phone_e164: phone,
        lat: pin.lat,
        lng: pin.lng,
        pincode: placePincode,
        area: placeArea,
        city: placeCity,
        starts_at,
        ends_at,
        community_id: communityId,
        image_url: imageUrl,
      });

      if (result.mod_status === 'pending') toast.show(copy.post.postedPending);
      router.replace(`/post/${result.id}`);
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Header
        title={isEdit ? copy.post.edit : undefined}
        left={<IconButton name="x" label={copy.common.cancel} onPress={() => goBack()} />}
      />
      <View style={styles.body}>
        {isSuspended ? (
          <Banner
            tone="warn"
            text={
              me?.profile.ban_permanent
                ? copy.moderation.permanentlyBanned
                : copy.moderation.suspendedUntil(new Date(me!.profile.banned_until as string).toLocaleDateString())
            }
          />
        ) : null}
        {!isEdit ? (
          <Segmented
            options={[
              { value: 'ask', label: 'Ask' },
              { value: 'alert', label: 'Alert' },
              { value: 'event', label: 'Event' },
            ]}
            value={type}
            onChange={(v) => setType(v as PostType)}
            full
          />
        ) : null}

        {type === 'ask' ? (
          <>
            <Segmented
              options={[
                { value: 'request', label: copy.compose.lookingFor },
                { value: 'offer', label: copy.compose.offering },
              ]}
              value={kind}
              onChange={(v) => setKind(v as PostKind)}
              full
            />
            <TagPicker value={tag} onChange={setTag} />
          </>
        ) : null}

        {type === 'alert' ? (
          <View style={styles.section}>
            <SectionTitle flush title="Until" />
            <DurationChips options={copy.compose.durationChips} value={alertDuration} onChange={setAlertDuration} />
          </View>
        ) : null}

        {type === 'event' ? (
          <View style={styles.section}>
            <SectionTitle flush title="Starts" />
            <DateTimeChips value={eventStart} onChange={setEventStart} />
            <SectionTitle flush title="Duration" />
            <DurationChips options={copy.compose.eventDurationChips} value={eventDuration} onChange={setEventDuration} />
          </View>
        ) : null}

        <TextField label="Title" value={title} onChangeText={setTitle} placeholder={hint} maxLength={120} />
        <TextField label="Details" value={body} onChangeText={setBody} multiline maxLength={2000} />

        <View style={styles.section}>
          <SectionTitle flush title="Photo or GIF (optional)" />
          {imageUrl ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
              <View style={styles.imageRemoveBtn}>
                <IconButton name="x" label="Remove photo" size={14} onPress={() => setImageUrl(null)} />
              </View>
            </View>
          ) : (
            <Button
              label={uploadPostImage.isPending ? 'Uploading…' : 'Add photo or GIF'}
              variant="ghost"
              icon="camera"
              onPress={pickImage}
              loading={uploadPostImage.isPending}
              disabled={uploadPostImage.isPending}
            />
          )}
        </View>

        {type === 'ask' ? (
          <View style={styles.section}>
            <TextField
              label="Phone (optional)"
              value={phoneDigits}
              onChangeText={(v) => setPhoneDigits(v.replace(/\D/g, '').slice(0, 10))}
              prefix="+91"
              keyboardType="number-pad"
              maxLength={10}
              hint={phoneDigits ? copy.post.phoneNote : undefined}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle flush
            title="Location"
            right={
              <Button
                label={copy.post.locationChange}
                size="sm"
                variant="text"
                onPress={() => setShowLocationPicker((v) => !v)}
              />
            }
          />
          <Text variant="secondary">{[placeArea, placePincode].filter(Boolean).join(' · ')}</Text>
          {showLocationPicker ? (
            <View style={styles.mapWrap}>
              <LocationPickerMap lat={pin.lat} lng={pin.lng} onChange={handlePinChange} height={220} />
            </View>
          ) : null}
        </View>

        {!isEdit && myCommunitiesList && myCommunitiesList.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle flush title={copy.communities.communityOptional} />
            <ChipRow flush>
              <Chip label={copy.communities.none} selected={!communityId} onPress={() => setCommunityId(null)} />
              {myCommunitiesList.map((c) => (
                <Chip key={c.id} label={c.name} selected={communityId === c.id} onPress={() => setCommunityId(c.id)} />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <Button size="lg" label={submitLabel} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s4 },
  section: { gap: space.s2 },
  mapWrap: { height: 220, borderRadius: radius.lg, overflow: 'hidden' },
  imagePreviewWrap: { alignSelf: 'flex-start' },
  imagePreview: { width: 180, height: 180, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  imageRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    boxShadow: shadow.xs,
  },
});
