import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import 'leaflet/dist/leaflet.css';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import { Crosshair } from './Crosshair';
import { colors, radius as radiusTokens } from '@/theme/tokens';
import { typeColor } from '@/theme/tokens';
import type { PostsMapProps } from './PostsMap.types';

// Web map (leaflet/react-leaflet), MOBILE-PLAN.md §7.5. Right-click/long-press
// (`contextmenu`) starts a new post pinned there, same as native long-press.
export default function PostsMap({ center, radiusKm, items, user, onPressPost, onLongPress, pinMode, onConfirmPin }: PostsMapProps) {
  const [pinCenter, setPinCenter] = useState(center);

  return (
    <View style={styles.wrap}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: colors.accent, fillColor: colors.accent, fillOpacity: 0.06, weight: 1 }}
        />
        {user ? (
          <CircleMarker
            center={[user.lat, user.lng]}
            radius={6}
            pathOptions={{ color: colors.surface, weight: 2, fillColor: colors.ink, fillOpacity: 1 }}
          />
        ) : null}
        {items.map((item) => (
          <CircleMarker
            key={item.id}
            center={[item.lat, item.lng]}
            radius={7}
            pathOptions={{ color: colors.surface, weight: 2, fillColor: typeColor[item.type], fillOpacity: 1 }}
            eventHandlers={{ click: () => onPressPost(item.id) }}
          >
            {/* Hover-only by default (not `permanent`) — click still opens the post. */}
            <Tooltip direction="top" offset={[0, -8]}>
              {item.title}
            </Tooltip>
          </CircleMarker>
        ))}
        <MapEventsHandler onLongPress={onLongPress} onCenterChange={setPinCenter} />
      </MapContainer>
      <Crosshair visible={pinMode} onConfirm={() => onConfirmPin(pinCenter)} />
    </View>
  );
}

function MapEventsHandler({
  onLongPress,
  onCenterChange,
}: {
  onLongPress: (c: { lat: number; lng: number }) => void;
  onCenterChange: (c: { lat: number; lng: number }) => void;
}) {
  const map = useMapEvents({
    contextmenu(e: LeafletMouseEvent) {
      e.originalEvent?.preventDefault?.();
      onLongPress({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    moveend() {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative', overflow: 'hidden', borderRadius: radiusTokens.md },
});
