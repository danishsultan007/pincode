import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Marker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { colors, radius } from '@/theme/tokens';

export type LocationPickerMapProps = {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
};

const markerIcon = L.divIcon({
  className: 'pincode-picker-marker',
  html: `<div style="width:16px;height:16px;border-radius:8px;background:${colors.accent};border:2px solid ${colors.surface};"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Draggable marker; a tap also moves it (MOBILE-PLAN.md §7.5).
export default function LocationPickerMap({ lat, lng, onChange, height = 220 }: LocationPickerMapProps) {
  const initialCenter = useMemo<[number, number]>(() => [lat, lng], []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.wrap, { height }]}>
      <MapContainer center={initialCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[lat, lng]}
          icon={markerIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const pos = m.getLatLng();
              onChange(pos.lat, pos.lng);
            },
          }}
        />
        <ClickHandler onChange={onChange} />
      </MapContainer>
    </View>
  );
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden' },
});
