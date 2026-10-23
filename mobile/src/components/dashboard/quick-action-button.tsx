import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';

interface QuickActionButtonProps {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityHint?: string;
}

/** The dashboard's main call to action: a full-width blue button with an icon. */
export function QuickActionButton({ label, icon: Icon, onPress, accessibilityHint }: QuickActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={styles.iconCircle}>
        <Icon size={18} color={Colors.textOnPrimary} strokeWidth={2.75} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_TARGET + 14,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.brand,
    ...Shadow.brand,
  },
  pressed: { backgroundColor: Colors.brandPressed, transform: [{ scale: 0.98 }] },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  label: { fontSize: FontSize.bodyLarge, fontWeight: '700', color: Colors.textOnPrimary, flexShrink: 1 },
});
