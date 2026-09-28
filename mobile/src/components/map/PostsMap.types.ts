// Shared props interface for PostsMap.native.tsx (react-native-maps) and
// PostsMap.tsx (leaflet/react-leaflet on web). MOBILE-PLAN.md §7.5.

export type PostsMapPoint = {
  id: string;
  lat: number;
  lng: number;
  type: 'ask' | 'alert' | 'event';
  title: string;
};

export type PostsMapProps = {
  center: { lat: number; lng: number };
  radiusKm: number;
  items: PostsMapPoint[];
  user?: { lat: number; lng: number } | null;
  onPressPost: (id: string) => void;
  onLongPress: (c: { lat: number; lng: number }) => void;
  pinMode: boolean;
  onConfirmPin: (c: { lat: number; lng: number }) => void;
};
