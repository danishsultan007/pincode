import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, radius, space } from '@/theme/tokens';

type ToastOptions = { actionLabel?: string; onAction?: () => void };
type ToastState = { message: string } & ToastOptions;

type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, options?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, ...options });
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  }, []);

  const handleAction = useCallback(() => {
    toast?.onAction?.();
    setToast(null);
    if (timer.current) clearTimeout(timer.current);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={styles.host}>
          <View style={styles.pill}>
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
          </View>
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
    bottom: space.s6,
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
    paddingHorizontal: space.s4,
    maxWidth: 520,
  },
  message: {
    color: colors.surface,
    flexShrink: 1,
  },
  action: {
    color: colors.accentSoft,
    fontWeight: '600',
  },
});
