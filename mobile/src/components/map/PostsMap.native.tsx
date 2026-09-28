import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, LongPressEvent, Marker, Region } from 'react-native-maps';
import { Crosshair } from './Crosshair';
import { colors, radius as radiusTokens } from '@/theme/tokens';
import { typeColor } from '@/theme/tokens';
import type { PostsMapProps } from './PostsMap.types';

// Native map (react-native-maps), MOBILE-PLAN.md §7.5. A marker tap opens the
// post; a long-press (or "+ Here" -> "Post here") starts a new post pinned
// there.
export default function PostsMap({ center, radiusKm, items, user, onPressPost, onLongPress, pinMode, onConfirmPin }: PostsMapProps) {
  const mapRef = useRef<MapView>(null);
  const [pinCenter, setPinCenter] = useState(center);

  const initialRegion: Region = {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: (radiusKm / 111) * 2.6,
    longitudeDelta: (radiusKm / 111) * 2.6,
  };

  const handleLongPress = (e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onLongPress({ lat: latitude, lng: longitude });
  };

  const handleRegionChangeComplete = (region: Region) => {
    setPinCenter({ lat: region.latitude, lng: region.longitude });
  };

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onLongPress={handleLongPress}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        <Circle
          center={{ latitude: center.lat, longitude: center.lng }}
          radius={radiusKm * 1000}
          strokeColor={colors.accent}
          fillColor="rgba(15,118,110,0.06)"
          strokeWidth={1}
        />
        {user ? (
          <Marker coordinate={{ latitude: user.lat, longitude: user.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.userDot} />
          </Marker>
        ) : null}
        {items.map((item) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.lat, longitude: item.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onPress={() => onPressPost(item.id)}
          >
            <View style={[styles.dot, { backgroundColor: typeColor[item.type] }]} />
          </Marker>
        ))}
      </MapView>
      <Crosshair visible={pinMode} onConfirm={() => onConfirmPin(pinCenter)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: radiusTokens.md, overflow: 'hidden' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.surface },
  userDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.ink },
});
