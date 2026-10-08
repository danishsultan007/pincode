import React from 'react';
import { LegalScreen } from '@/components/legal/LegalScreen';
import { PRIVACY_SECTIONS } from '@/lib/legal';

export default function Privacy() {
  return <LegalScreen title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
