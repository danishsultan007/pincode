import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, motion, radius, shadow, space } from '@/theme/tokens';

type ToastOptions = { actionLabel?: string; onAction?: () => void };
type ToastState = { message: string } & ToastOptions;

type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  const show = useCallback((message: string, options?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, ...options });
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  }, [anim]);

  const handleAction = useCallback(() => {
    toast?.onAction?.();
    setToast(null);
    if (timer.current) clearTimeout(timer.current);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[styles.host, { bottom: 96 + insets.bottom }]}>
          <Animated.View
            pointerEvents={toast.actionLabel ? 'box-none' : 'none'}
            style={[
              styles.pill,
              { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
            ]}
          >
            <Text variant="body" numeric={false} numberOfLines={2} style={styles.message}>
              {toast.message}
            </Text>
            {toast.actionLabel ? (
              <Pressable onPress={handleAction} hitSlop={8}>
                <Text variant="body" style={styles.action}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.s4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: space.s3,
    paddingHorizontal: 18,
    boxShadow: shadow.popover,
    maxWidth: 520,
  },
  message: {
    color: colors.onInk,
    flexShrink: 1,
  },
  action: {
    color: colors.accentInverse,
    fontWeight: '700',
  },
});
