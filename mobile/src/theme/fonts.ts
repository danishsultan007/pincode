import type { TextStyle } from 'react-native';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { font } from './tokens';

export const fontAssets = {
  [font.regular]: PlusJakartaSans_400Regular,
  [font.medium]: PlusJakartaSans_500Medium,
  [font.semibold]: PlusJakartaSans_600SemiBold,
  [font.bold]: PlusJakartaSans_700Bold,
  [font.extrabold]: PlusJakartaSans_800ExtraBold,
};

// Each weight is its own single-weight family, so callers keep writing
// fontWeight and Text.tsx swaps it for the matching family.
export function fontFor(weight: TextStyle['fontWeight'] | undefined): string {
  switch (String(weight ?? '400')) {
    case '500':
      return font.medium;
    case '600':
      return font.semibold;
    case '700':
    case 'bold':
      return font.bold;
    case '800':
    case '900':
      return font.extrabold;
    default:
      return font.regular;
  }
}
