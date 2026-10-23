import { CircleAlert, CircleCheck, Clock } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import type { Loan } from '@/api/types';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { pluralize } from '@/lib/format';

const BADGES = {
  // Solid red, so it still stands out on the red-tinted overdue card.
  overdue: { label: 'OVERDUE', icon: CircleAlert, background: Colors.danger, color: Colors.textOnPrimary },
  repaid: { label: 'REPAID', icon: CircleCheck, background: Colors.successSoft, color: Colors.successText },
  pending: { label: 'PENDING', icon: Clock, background: Colors.warningSoft, color: Colors.warningText },
} as const;

/** Text label + icon, so status never relies on color alone. */
export function StatusBadge({ loan }: { loan: Pick<Loan, 'status' | 'isOverdue'> }) {
  const badge = loan.isOverdue ? BADGES.overdue : loan.status === 'REPAID' ? BADGES.repaid : BADGES.pending;
  const Icon = badge.icon;
  return (
    <View style={[styles.badge, { backgroundColor: badge.background }]}>
      <Icon size={12} color={badge.color} strokeWidth={2.5} />
      <Text style={[styles.label, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

/** "Overdue by 3 days" line for overdue loans. */
export function OverdueBadge({ daysOverdue }: { daysOverdue: number }) {
  return (
    <Text style={styles.overdueText} numberOfLines={1}>
      Overdue by {pluralize(daysOverdue, 'day')}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    alignSelf: 'flex-end',
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  overdueText: { fontSize: FontSize.small, fontWeight: '600', color: Colors.dangerText },
});
