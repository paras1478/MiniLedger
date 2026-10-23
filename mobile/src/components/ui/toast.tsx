import { CircleCheck } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';

const VISIBLE_MS = 2600;

const ToastContext = createContext<((message: string) => void) | null>(null);

/**
 * Brief success confirmation shown above every screen (e.g. after saving a loan), so a screen
 * can close and the message still appears on the screen the user returns to.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const nextId = useRef(0);
  const { top } = useSafeAreaInsets();

  const show = useCallback((message: string) => setToast({ id: ++nextId.current, message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: top + Spacing.sm }]}>
        {toast && (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(180)}
            style={styles.toast}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <CircleCheck size={20} color={Colors.success} strokeWidth={2.5} />
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    maxWidth: 480,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    ...Shadow.raised,
  },
  text: { flexShrink: 1, fontSize: FontSize.body, fontWeight: '600', color: Colors.textOnPrimary },
});
