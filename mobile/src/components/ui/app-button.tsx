import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, FontSize, Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';

type Variant = 'primary' | 'brand' | 'success' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, { background: string; pressed: string; text: string; border?: string }> = {
  primary: { background: Colors.primary, pressed: '#0F1A3D', text: Colors.textOnPrimary },
  brand: { background: Colors.brand, pressed: Colors.brandPressed, text: Colors.textOnPrimary },
  success: { background: Colors.successText, pressed: '#166534', text: Colors.textOnPrimary },
  secondary: { background: Colors.surface, pressed: Colors.background, text: Colors.primary, border: Colors.border },
  danger: { background: Colors.surface, pressed: Colors.dangerSoft, text: Colors.dangerText, border: '#FECACA' },
};

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
}: AppButtonProps) {
  const colors = VARIANTS[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.pressed : colors.background,
          borderColor: colors.border ?? colors.background,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          {Icon && <Icon size={20} color={colors.text} strokeWidth={2.25} />}
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.bodyLarge,
    fontWeight: '600',
  },
});
