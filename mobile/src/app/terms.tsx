import React from 'react';
import { LegalScreen } from '@/components/legal/LegalScreen';
import { TERMS_SECTIONS } from '@/lib/legal';

export default function Terms() {
  return <LegalScreen title="Terms of Service" sections={TERMS_SECTIONS} />;
}
