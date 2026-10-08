// Sentry's Expo Metro config: adds debug IDs so crash stack traces can be
// un-minified. Behaves like the default Expo config otherwise.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
