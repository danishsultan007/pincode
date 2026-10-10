import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { colors } from '@/theme/tokens';

export type BottomSafeAreaProps = {
  children: React.ReactNode;
  bg?: string;
};

// Wraps a sticky bottom block (composer, banners) so it clears the system
// navigation bar / home indicator. The inset is dropped while the keyboard is
// up because the keyboard already covers that area; keeping it would leave a
// gap between the composer and the keyboard.
export function BottomSafeArea({ children, bg = colors.surface }: BottomSafeAreaProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  return <View style={{ backgroundColor: bg, paddingBottom: keyboardVisible ? 0 : insets.bottom }}>{children}</View>;
}
