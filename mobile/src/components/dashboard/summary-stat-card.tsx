import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';

export type StatTone = 'success' | 'warning' | 'danger' | 'brand';

const TONES: Record<StatTone, { icon: string; iconBackground: string; value: string }> = {
  success: { icon: Colors.success, iconBackground: Colors.successSoft, value: Colors.successText },
  warning: { icon: Colors.warning, iconBackground: Colors.warningSoft, value: Colors.warningText },
  danger: { icon: Colors.danger, iconBackground: Colors.dangerSoft, value: Colors.dangerText },
  brand: { icon: Colors.brand, iconBackground: Colors.brandSoft, value: Colors.text },
};

interface SummaryStatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: StatTone;
  /** Small supporting line, e.g. "2 loans". */
  caption?: string;
  /** Use the tone color for the value (e.g. only when an overdue amount is non-zero). */
  emphasizeValue?: boolean;
}

export function SummaryStatCard({ label, value, icon: Icon, tone, caption, emphasizeValue = true }: SummaryStatCardProps) {
  const colors = TONES[tone];
  return (
    <View style={[styles.card, { borderTopColor: colors.icon }]} accessible accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ''}`}>
      <View style={[styles.iconCircle, { backgroundColor: colors.iconBackground }]}>
        <Icon size={20} color={colors.icon} strokeWidth={2.25} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.value, { color: emphasizeValue ? colors.value : Colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {value}
      </Text>
      {caption && (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: 2,
    // A thin colored top edge ties each card to its tone without a loud fill.
    borderTopWidth: 3,
    ...Shadow.card,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  label: { fontSize: FontSize.small, fontWeight: '500', color: Colors.textMuted },
  value: { fontSize: FontSize.heading, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  caption: { fontSize: FontSize.caption, color: Colors.textMuted },
});
