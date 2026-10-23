import { CircleCheck } from 'lucide-react-native';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Loan } from '@/api/types';
import { OverdueBadge, StatusBadge } from '@/components/loans/status-badge';
import { AvatarColors, Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { formatDate, formatINR, getInitials, pluralize } from '@/lib/format';

function avatarColorsFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AvatarColors[Math.abs(hash) % AvatarColors.length]!;
}

interface LoanCardProps {
  loan: Loan;
  /** Makes the card body tappable (e.g. to open loan details). */
  onPress?: (loan: Loan) => void;
  /** When set, PENDING loans show a "Mark as repaid" action. */
  onMarkRepaid?: (loan: Loan) => void;
  isUpdating?: boolean;
}

/** One loan: avatar, friend, due date, amount and status. Overdue loans get a red accent. */
export const LoanCard = memo(function LoanCard({ loan, onPress, onMarkRepaid, isUpdating = false }: LoanCardProps) {
  const avatar = avatarColorsFor(loan.friendName);
  const isRepaid = loan.status === 'REPAID';
  const amount = formatINR(loan.amount);
  const dueText = isRepaid ? `Was due ${formatDate(loan.dueDate)}` : `Due ${formatDate(loan.dueDate)}`;
  const a11yStatus = loan.isOverdue
    ? `overdue by ${pluralize(loan.daysOverdue, 'day')}`
    : isRepaid
      ? 'repaid'
      : 'pending';

  const summaryLabel = `${loan.friendName}, ${amount}, ${dueText}, ${a11yStatus}`;

  // The tappable body and the "Mark as repaid" button are siblings, never nested: on web each
  // Pressable becomes a <button>, and a <button> inside a <button> is invalid HTML.
  return (
    <View style={[styles.card, loan.isOverdue && styles.cardOverdue]}>
      <Pressable
        onPress={onPress ? () => onPress(loan) : undefined}
        disabled={!onPress}
        accessible
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={summaryLabel}
        accessibilityHint={onPress ? 'Opens loan details' : undefined}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={[styles.avatar, { backgroundColor: avatar.background }]}>
          <Text style={[styles.initials, { color: avatar.text }]}>{getInitials(loan.friendName)}</Text>
        </View>

        <View style={styles.middle}>
          <Text style={styles.name} numberOfLines={1}>
            {loan.friendName}
          </Text>
          {loan.isOverdue ? (
            <OverdueBadge daysOverdue={loan.daysOverdue} />
          ) : (
            <Text style={styles.due} numberOfLines={1}>
              {dueText}
            </Text>
          )}
        </View>

        <View style={styles.right}>
          <Text
            style={[styles.amount, isRepaid && styles.amountRepaid]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}>
            {amount}
          </Text>
          <StatusBadge loan={loan} />
        </View>
      </Pressable>

      {onMarkRepaid && loan.status === 'PENDING' && (
        <Pressable
          onPress={() => onMarkRepaid(loan)}
          disabled={isUpdating}
          accessibilityRole="button"
          accessibilityLabel={`Mark ${amount} from ${loan.friendName} as repaid`}
          accessibilityState={{ disabled: isUpdating, busy: isUpdating }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={Colors.successText} />
          ) : (
            <>
              <CircleCheck size={18} color={Colors.successText} />
              <Text style={styles.actionText}>Mark as repaid</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.surface,
    ...Shadow.card,
  },
  cardOverdue: {
    backgroundColor: Colors.dangerSoft,
    borderLeftColor: Colors.danger,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.md },
  rowPressed: { opacity: 0.7 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: FontSize.body, fontWeight: '700' },
  middle: { flex: 1, gap: 3 },
  name: { fontSize: FontSize.bodyLarge, fontWeight: '600', color: Colors.text },
  due: { fontSize: FontSize.small, color: Colors.textMuted },
  right: { alignItems: 'flex-end', gap: 6, maxWidth: '45%' },
  amount: { fontSize: FontSize.bodyLarge, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  amountRepaid: { color: Colors.textMuted },
  action: {
    marginTop: Spacing.md,
    minHeight: TOUCH_TARGET,
    borderRadius: Radius.md,
    backgroundColor: Colors.successSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actionPressed: { backgroundColor: '#DCFCE7' },
  actionText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.successText },
});
