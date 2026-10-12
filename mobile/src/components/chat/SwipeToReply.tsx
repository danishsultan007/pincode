import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/tokens';

// Master switch: if the swipe ever misbehaves on a device, set this to false and the long-press
// menu's Reply (which does not depend on it) is all that is left.
export const SWIPE_REPLY = true;

const TRIGGER = 56; // how far to drag before letting go counts as "reply"
const MAX_PULL = 80;
const EDGE = 28; // leave the screen edges to the system back-swipe

// Drag a message to the right to reply to it (touch devices only). The gesture is claimed only
// once the finger has clearly moved sideways, so taps, long-presses and scrolling the list are
// untouched, and a vertical scroll can still take it back. The tree is the same whether or not
// the swipe is enabled, so a row never remounts (and its photo never reloads) when that changes.
export function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const widthRef = useRef(width);
  widthRef.current = width;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // (g.x0 is only filled in once the gesture is ours, so the start position is worked out from the touch)
        onMoveShouldSetPanResponder: (e, g) => {
          const startX = e.nativeEvent.pageX - g.dx;
          return g.dx > 12 && Math.abs(g.dx) > 2 * Math.abs(g.dy) && startX > EDGE && startX < widthRef.current - EDGE;
        },
        onPanResponderGrant: () => {
          fired.current = false;
        },
        onPanResponderMove: (_e, g) => {
          const dx = Math.max(0, g.dx);
          // gets heavier the further it is pulled
          x.setValue(dx <= TRIGGER ? dx : Math.min(MAX_PULL, TRIGGER + (dx - TRIGGER) * 0.3));
          fired.current = dx >= TRIGGER;
        },
        onPanResponderRelease: () => {
          if (fired.current) onReplyRef.current();
          Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [x]
  );

  const active = SWIPE_REPLY && enabled && Platform.OS !== 'web';
  const iconOpacity = x.interpolate({ inputRange: [8, TRIGGER], outputRange: [0, 1], extrapolate: 'clamp' });
  const iconScale = x.interpolate({ inputRange: [8, TRIGGER], outputRange: [0.6, 1], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.icon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
        <Icon name="reply" size={18} color={colors.ink2} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...(active ? pan.panHandlers : {})}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
