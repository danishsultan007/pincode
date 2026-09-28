import type { ExpoConfig } from 'expo/config';

const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

const config: ExpoConfig = {
  name: 'pincode',
  slug: 'pincode',
  scheme: 'pincode',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.pincode.app', supportsTablet: false },
  android: { package: 'com.pincode.app' },
  // favicon: source art for the browser tab icon (the app's pin-drop mark,
  // see src/components/ui/Logo.tsx; assets/favicon-source.png is a
  // hand-rasterized copy — see scripts/_gen-favicon-source.cjs — since
  // Expo's favicon pipeline can't take SVG input). `expo export
  // --platform web` turns this into a real favicon.ico automatically; a
  // copy of that generated file also lives at public/favicon.ico so `expo
  // start --web` (which doesn't run the export-time favicon step) serves it
  // too, via every browser's implicit /favicon.ico request.
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon-source.png' },
  plugins: [
    'expo-router',
    ['expo-location', { locationWhenInUsePermission: 'pincode uses your location to show posts from your neighborhood.' }],
    ['expo-image-picker', { photosPermission: 'pincode needs your photos to set a profile picture.' }],
    ['expo-notifications', { color: '#0f766e' }],
    ...(mapsKey ? [['react-native-maps', { androidGoogleMapsApiKey: mapsKey }] as [string, any]] : []),
  ],
  extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined } },
  experiments: { typedRoutes: false },
};

export default config;
