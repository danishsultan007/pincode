import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { MapPressEvent, Marker, Region } from 'react-native-maps';
import { colors, radius } from '@/theme/tokens';

export type LocationPickerMapProps = {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
};

// Draggable marker; a tap also moves it (MOBILE-PLAN.md §7.5).
export default function LocationPickerMap({ lat, lng, onChange, height = 220 }: LocationPickerMapProps) {
  const [region] = useState<Region>({ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 });

  const handlePress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onChange(latitude, longitude);
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={region} onPress={handlePress}>
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          draggable
          onDragEnd={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            onChange(latitude, longitude);
          }}
        >
          <View style={styles.dot} />
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.surface },
});
