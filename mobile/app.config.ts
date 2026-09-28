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
  web: { bundler: 'metro', output: 'single' },
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
