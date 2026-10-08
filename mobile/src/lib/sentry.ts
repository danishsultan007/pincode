// Crash reporting. Inert unless EXPO_PUBLIC_SENTRY_DSN is set, and never on web
// (web errors aren't part of the Play beta). Import this FIRST in the root layout.
import type React from 'react';
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryEnabled = !!dsn && Platform.OS !== 'web';

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

export function reportError(error: unknown): void {
  if (sentryEnabled) Sentry.captureException(error);
}

// Wraps the root component so native crashes/navigation are instrumented.
export function wrapRoot<T extends React.ComponentType<any>>(component: T): T {
  return sentryEnabled ? (Sentry.wrap(component) as unknown as T) : component;
}
