import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme/tokens';

export type LogoProps = { size?: number };

// The app's mark: a solid pin drop, same silhouette as the outline "pin"
// icon in Icon.tsx but filled rather than stroked, so it reads as a logo
// mark rather than a UI icon. Red per the product's own name (pincode) and
// the pin-drop metaphor, distinct from the teal accent used for actions.
export function Logo({ size = 22 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill={colors.logoRed} />
      <Circle cx={12} cy={10} r={3.2} fill={colors.bg} />
    </Svg>
  );
}
