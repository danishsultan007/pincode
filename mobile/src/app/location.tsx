import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Segmented } from '@/components/ui/Segmented';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useLocation, RadiusKm } from '@/providers/LocationProvider';
import { useToast } from '@/providers/ToastProvider';
import { forwardGeocode } from '@/lib/location';
import { RADII } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

export default function LocationModal() {
  const location = useLocation();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const handleSubmit = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const result = await forwardGeocode(q);
      if (!result) {
        toast.show("We couldn't find that place. Try a pincode or area name.");
        return;
      }
      location.setLocation({ lat: result.lat, lng: result.lng, area: result.area, city: result.city, pincode: result.pincode });
      goBack();
    } finally {
      setSearching(false);
    }
  };

  const handleJump = async (area: string) => {
    setSearching(true);
    try {
      const result = await forwardGeocode(area);
      if (result) {
        location.setLocation({ lat: result.lat, lng: result.lng, area: result.area, city: result.city, pincode: result.pincode });
        goBack();
      }
    } finally {
      setSearching(false);
    }
  };

  const handleUseCurrent = async () => {
    await location.useCurrentLocation();
    goBack();
  };

  return (
    <Sheet title="Location" onClose={() => goBack()}>
      <View style={styles.body}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={copy.location.searchPlaceholder}
          keyboardType="default"
        />
        <Button label="Search" onPress={handleSubmit} loading={searching} disabled={!query.trim()} />

        <Button label={copy.location.useCurrent} variant="ghost" icon="crosshair" onPress={handleUseCurrent} loading={location.status === 'loading'} />

        <SectionTitle title="Jump to" />
        <ChipRow>
          {copy.location.jumpChips.map((area) => (
            <Chip key={area} label={area} onPress={() => handleJump(area)} />
          ))}
        </ChipRow>

        <SectionTitle title="Radius" />
        <Segmented
          options={RADII.map((r) => ({ value: String(r), label: `${r} km` }))}
          value={String(location.radius)}
          onChange={(v) => location.setRadius(Number(v) as RadiusKm)}
          full
        />
        <Text variant="meta">{[location.area, location.pincode].filter(Boolean).join(' · ')}</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
});
