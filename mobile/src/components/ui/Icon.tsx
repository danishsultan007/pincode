import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { colors } from '@/theme/tokens';

// Feather-style (MIT) icon set, hand-rolled on react-native-svg so we avoid
// the deprecated vector-icons package. viewBox 0 0 24 24, stroke width 1.8,
// round caps/joins, per MOBILE-PLAN.md §7.2.

export type IconName =
  | 'pin'
  | 'search'
  | 'map'
  | 'list'
  | 'plus'
  | 'x'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'check'
  | 'share'
  | 'link'
  | 'more'
  | 'arrow-up'
  | 'message'
  | 'bell'
  | 'user'
  | 'users'
  | 'home'
  | 'inbox'
  | 'flag'
  | 'shield'
  | 'send'
  | 'camera'
  | 'settings'
  | 'phone'
  | 'clock'
  | 'calendar'
  | 'alert'
  | 'star'
  | 'lock'
  | 'log-out'
  | 'edit'
  | 'trash'
  | 'refresh'
  | 'crosshair';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

const STROKE_WIDTH = 1.8;

function shapes(name: IconName): React.ReactNode {
  const common = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'pin':
      return (
        <>
          <Path {...common} d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <Circle {...common} cx={12} cy={10} r={3} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...common} cx={11} cy={11} r={8} />
          <Line {...common} x1={21} y1={21} x2={16.65} y2={16.65} />
        </>
      );
    case 'map':
      return (
        <>
          <Polygon {...common} points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <Line {...common} x1={8} y1={2} x2={8} y2={18} />
          <Line {...common} x1={16} y1={6} x2={16} y2={22} />
        </>
      );
    case 'list':
      return (
        <>
          <Line {...common} x1={8} y1={6} x2={21} y2={6} />
          <Line {...common} x1={8} y1={12} x2={21} y2={12} />
          <Line {...common} x1={8} y1={18} x2={21} y2={18} />
          <Line {...common} x1={3} y1={6} x2={3.01} y2={6} />
          <Line {...common} x1={3} y1={12} x2={3.01} y2={12} />
          <Line {...common} x1={3} y1={18} x2={3.01} y2={18} />
        </>
      );
    case 'plus':
      return (
        <>
          <Line {...common} x1={12} y1={5} x2={12} y2={19} />
          <Line {...common} x1={5} y1={12} x2={19} y2={12} />
        </>
      );
    case 'x':
      return (
        <>
          <Line {...common} x1={18} y1={6} x2={6} y2={18} />
          <Line {...common} x1={6} y1={6} x2={18} y2={18} />
        </>
      );
    case 'chevron-down':
      return <Polyline {...common} points="6 9 12 15 18 9" />;
    case 'chevron-right':
      return <Polyline {...common} points="9 18 15 12 9 6" />;
    case 'chevron-left':
      return <Polyline {...common} points="15 18 9 12 15 6" />;
    case 'check':
      return <Polyline {...common} points="20 6 9 17 4 12" />;
    case 'share':
      return (
        <>
          <Circle {...common} cx={18} cy={5} r={3} />
          <Circle {...common} cx={6} cy={12} r={3} />
          <Circle {...common} cx={18} cy={19} r={3} />
          <Line {...common} x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
          <Line {...common} x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
        </>
      );
    case 'link':
      return (
        <>
          <Path {...common} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <Path {...common} d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </>
      );
    case 'more':
      return (
        <>
          <Circle fill="currentColor" cx={12} cy={12} r={1.4} />
          <Circle fill="currentColor" cx={19} cy={12} r={1.4} />
          <Circle fill="currentColor" cx={5} cy={12} r={1.4} />
        </>
      );
    case 'arrow-up':
      return (
        <>
          <Line {...common} x1={12} y1={19} x2={12} y2={5} />
          <Polyline {...common} points="5 12 12 5 19 12" />
        </>
      );
    case 'message':
      return (
        <Path
          {...common}
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        />
      );
    case 'bell':
      return (
        <>
          <Path {...common} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path {...common} d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
      );
    case 'user':
      return (
        <>
          <Path {...common} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle {...common} cx={12} cy={7} r={4} />
        </>
      );
    case 'users':
      return (
        <>
          <Path {...common} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Circle {...common} cx={9} cy={7} r={4} />
          <Path {...common} d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <Path {...common} d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      );
    case 'home':
      return (
        <>
          <Path {...common} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Polyline {...common} points="9 22 9 12 15 12 15 22" />
        </>
      );
    case 'inbox':
      return (
        <>
          <Polyline {...common} points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <Path
            {...common}
            d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
          />
        </>
      );
    case 'flag':
      return (
        <>
          <Path {...common} d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <Line {...common} x1={4} y1={22} x2={4} y2={15} />
        </>
      );
    case 'shield':
      return <Path {...common} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
    case 'send':
      return <Polygon {...common} points="22 2 15 22 11 13 2 9 22 2" />;
    case 'camera':
      return (
        <>
          <Path
            {...common}
            d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
          />
          <Circle {...common} cx={12} cy={13} r={4} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={3} />
          <Path
            {...common}
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </>
      );
    case 'phone':
      return (
        <Path
          {...common}
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
        />
      );
    case 'clock':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={10} />
          <Polyline {...common} points="12 6 12 12 16 14" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect {...common} x={3} y={4} width={18} height={18} rx={2} ry={2} />
          <Line {...common} x1={16} y1={2} x2={16} y2={6} />
          <Line {...common} x1={8} y1={2} x2={8} y2={6} />
          <Line {...common} x1={3} y1={10} x2={21} y2={10} />
        </>
      );
    case 'alert':
      return (
        <>
          <Path {...common} d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <Line {...common} x1={12} y1={9} x2={12} y2={13} />
          <Line {...common} x1={12} y1={17} x2={12.01} y2={17} />
        </>
      );
    case 'star':
      return (
        <Polygon
          {...common}
          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        />
      );
    case 'lock':
      return (
        <>
          <Rect {...common} x={3} y={11} width={18} height={11} rx={2} ry={2} />
          <Path {...common} d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      );
    case 'log-out':
      return (
        <>
          <Path {...common} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Polyline {...common} points="16 17 21 12 16 7" />
          <Line {...common} x1={21} y1={12} x2={9} y2={12} />
        </>
      );
    case 'edit':
      return <Path {...common} d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />;
    case 'trash':
      return (
        <>
          <Polyline {...common} points="3 6 5 6 21 6" />
          <Path {...common} d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <Line {...common} x1={10} y1={11} x2={10} y2={17} />
          <Line {...common} x1={14} y1={11} x2={14} y2={17} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Polyline {...common} points="23 4 23 10 17 10" />
          <Polyline {...common} points="1 20 1 14 7 14" />
          <Path {...common} d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </>
      );
    case 'crosshair':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={10} />
          <Line {...common} x1={22} y1={12} x2={18} y2={12} />
          <Line {...common} x1={6} y1={12} x2={2} y2={12} />
          <Line {...common} x1={12} y1={6} x2={12} y2={2} />
          <Line {...common} x1={12} y1={22} x2={12} y2={18} />
        </>
      );
    default:
      return null;
  }
}

export function Icon({ name, size = 16, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={STROKE_WIDTH} color={color}>
      {shapes(name)}
    </Svg>
  );
}
