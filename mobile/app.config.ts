import type { ExpoConfig } from 'expo/config';

const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

// EAS: run `eas init` once, then paste the printed project id and your Expo
// username/org as literals in the two fallbacks below (EAS needs them from the
// config itself, and .env isn't uploaded to build workers). Both are set for
// @danishsultan007/pincode; neither is a secret.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '2de7a6bf-80cd-4e00-9051-19ec6e3d9e75';
const EAS_OWNER = process.env.EAS_OWNER || 'danishsultan007';

// Firebase config for FCM push. EAS injects the file path through the
// GOOGLE_SERVICES_JSON file env var; for a local native build set it to ./google-services.json.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || undefined;

const config: ExpoConfig = {
  name: 'pincode',
  slug: 'pincode',
  scheme: 'pincode',
  owner: EAS_OWNER,
  version: '1.0.0',
  orientation: 'portrait',
  // 'automatic' follows the phone's light/dark setting (src/theme/tokens.ts reads it).
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'appVersion' },
  updates: EAS_PROJECT_ID ? { url: `https://u.expo.dev/${EAS_PROJECT_ID}` } : undefined,
  ios: { bundleIdentifier: 'com.pincode.app', supportsTablet: false },
  android: {
    package: 'com.pincode.app',
    // versionCode is managed remotely by EAS (appVersionSource: remote in eas.json).
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#4B41D6' },
    googleServicesFile,
    // Photos come from the system Photo Picker, so none of the broad media
    // permissions are needed (and Play restricts them). Nothing uses the mic.
    blockedPermissions: [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
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
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#F6F4F0',
        dark: { backgroundColor: '#0F0E0C' },
      },
    ],
    ['expo-location', { locationWhenInUsePermission: 'pincode uses your location to show posts from your neighborhood.' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'pincode uses your photos so you can add pictures to posts and your profile.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: '#4B41D6' }],
    'expo-updates',
    // Crash reporting. Source-map upload needs SENTRY_AUTH_TOKEN (an EAS secret);
    // only wired in when SENTRY_ORG is set so local/dev builds don't need it.
    ...(process.env.SENTRY_ORG
      ? ([['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }]] as [string, any][])
      : []),
    ...(mapsKey ? [['react-native-maps', { androidGoogleMapsApiKey: mapsKey }] as [string, any]] : []),
  ],
  extra: { eas: { projectId: EAS_PROJECT_ID || undefined } },
  experiments: { typedRoutes: false },
};

export default config;
