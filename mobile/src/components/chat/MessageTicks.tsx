import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { copy } from '@/lib/copy';
import { colors } from '@/theme/tokens';

export type TickStatus = 'sent' | 'delivered' | 'read';

const LABEL: Record<TickStatus, string> = {
  sent: copy.chat.tickSent,
  delivered: copy.chat.tickDelivered,
  read: copy.chat.tickRead,
};

export function tickLabel(status: TickStatus): string {
  return LABEL[status];
}

// One tick = sent, two ticks = delivered, two coloured ticks = read. Drawn with the same round
// stroke as the icon set; sits at the end of the time line inside my (accent) bubble.
export function MessageTicks({ status }: { status: TickStatus }) {
  const color = status === 'read' ? colors.tickRead : colors.accentInk;
  const opacity = status === 'read' ? 1 : 0.72;
  const stroke = status === 'read' ? 2.1 : 1.7; // read is also heavier, so it never relies on colour alone
  const double = status !== 'sent';
  return (
    <Svg
      width={double ? 18 : 12}
      height={12}
      viewBox={double ? '0 0 18 12' : '0 0 12 12'}
      accessibilityLabel={LABEL[status]}
      accessibilityRole="image"
    >
      <Path
        d="M1.5 6.5 L4.5 9.5 L10.5 2.5"
        fill="none"
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {double ? (
        <Path
          d="M7.5 6.5 L10.5 9.5 L16.5 2.5"
          fill="none"
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}
