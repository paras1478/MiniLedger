import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CalendarDays, CircleCheck, Clock, Info, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLoan, repayLoan } from '@/api/endpoints';
import { OverdueBadge, StatusBadge } from '@/components/loans/status-badge';
import { AppButton } from '@/components/ui/app-button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusedQuery } from '@/hooks/use-focused-query';
import { ApiError } from '@/lib/api-client';
import { confirmAction, showError } from '@/lib/dialogs';
import { formatDate, formatINR, getInitials, localDateOnly } from '@/lib/format';

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.detailIcon}>
        <Icon size={18} color={Colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const FIGURE_TONES = { success: Colors.successText, warning: Colors.warningText, danger: Colors.dangerText };

function Figure({ label, value, tone }: { label: string; value: string; tone?: keyof typeof FIGURE_TONES }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.figureValue, tone && { color: FIGURE_TONES[tone] }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

function breakdownLabel(amount: string, isRepaid: boolean): string {
  const total = formatINR(amount);
  return isRepaid
    ? `Original amount ${total}, fully repaid, nothing remaining`
    : `Original amount ${total}, nothing repaid yet, ${total} remaining`;
}

/** ISO timestamp -> "23 Oct 2026, 10:45 pm" in the device's timezone. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${formatDate(localDateOnly(0, date))}, ${time}`;
}

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authRequest } = useAuth();
  const showToast = useToast();
  const [isRepaying, setIsRepaying] = useState(false);

  const fetchLoan = useCallback((signal: AbortSignal) => getLoan(authRequest, id, signal), [authRequest, id]);
  const { data, error, isLoading, isRefreshing, refresh, setData } = useFocusedQuery(fetchLoan);
  const loan = data?.loan;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/loans'));

  const markRepaid = async () => {
    if (!loan) return;
    setIsRepaying(true);
    try {
      const updated = await repayLoan(authRequest, loan.id);
      setData(() => updated);
      showToast(`${updated.loan.friendName}'s loan marked as repaid`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.isAuthError) return;
      showError("Couldn't update loan", caught instanceof ApiError ? caught.message : 'Please try again.');
      if (caught instanceof ApiError && caught.status === 409) refresh();
    } finally {
      setIsRepaying(false);
    }
  };

  const confirmRepaid = () =>
    loan &&
    confirmAction(
      'Mark as repaid?',
      `${formatINR(loan.amount)} from ${loan.friendName} will be marked as repaid.`,
      'Mark repaid',
      () => void markRepaid()
    );

  let content: React.ReactNode;
  if (isLoading && !loan) {
    content = (
      <View style={styles.gap} accessibilityLabel="Loading loan" accessibilityRole="progressbar">
        <Skeleton height={190} radius={Radius.xl} />
        <Skeleton height={150} radius={Radius.lg} />
      </View>
    );
  } else if (!loan) {
    content =
      error?.code === 'LOAN_NOT_FOUND' ? (
        <ErrorState error={error} onRetry={back} />
      ) : (
        error && <ErrorState error={error} onRetry={refresh} />
      );
  } else {
    const isRepaid = loan.status === 'REPAID';
    content = (
      <View style={styles.gap}>
        <View style={[styles.hero, loan.isOverdue && styles.heroOverdue]}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{getInitials(loan.friendName)}</Text>
          </View>
          <Text style={styles.friend} accessibilityRole="header">
            {loan.friendName}
          </Text>
          <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatINR(loan.amount)}
          </Text>
          <View style={styles.badges}>
            <StatusBadge loan={loan} />
            {loan.isOverdue && <OverdueBadge daysOverdue={loan.daysOverdue} />}
          </View>
        </View>

        <View style={styles.breakdown} accessible accessibilityLabel={breakdownLabel(loan.amount, isRepaid)}>
          <Figure label="Original amount" value={formatINR(loan.amount)} />
          <View style={styles.breakdownDivider} />
          <Figure label="Amount repaid" value={formatINR(isRepaid ? loan.amount : '0')} tone={isRepaid ? 'success' : undefined} />
          <View style={styles.breakdownDivider} />
          <Figure
            label="Remaining"
            value={formatINR(isRepaid ? '0' : loan.amount)}
            tone={isRepaid ? undefined : loan.isOverdue ? 'danger' : 'warning'}
          />
        </View>

        <View style={styles.card}>
          <DetailRow icon={CalendarDays} label="Due date" value={formatDate(loan.dueDate)} />
          <View style={styles.divider} />
          <DetailRow icon={Clock} label="Recorded on" value={formatTimestamp(loan.createdAt)} />
          {isRepaid && (
            <>
              <View style={styles.divider} />
              <DetailRow icon={CircleCheck} label="Marked repaid" value={formatTimestamp(loan.updatedAt)} />
            </>
          )}
        </View>

        {!isRepaid ? (
          <>
            <AppButton
              label="Mark as repaid"
              icon={CircleCheck}
              variant="success"
              loading={isRepaying}
              onPress={confirmRepaid}
            />
            <View style={styles.note}>
              <Info size={16} color={Colors.textMuted} />
              <Text style={styles.noteText}>Repayments are recorded in full: the whole amount is marked as repaid.</Text>
            </View>
          </>
        ) : (
          <View style={styles.repaidNote}>
            <CircleCheck size={18} color={Colors.successText} />
            <Text style={styles.repaidText}>This loan has been repaid.</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
          <ArrowLeft size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Loan details
        </Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }>
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  headerTitle: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  iconButton: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, width: '100%', maxWidth: 560, alignSelf: 'center' },
  gap: { gap: Spacing.lg },
  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xxl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderTopWidth: 4,
    borderTopColor: Colors.surface,
    ...Shadow.card,
  },
  heroOverdue: { backgroundColor: Colors.dangerSoft, borderTopColor: Colors.danger },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: FontSize.heading, fontWeight: '700', color: Colors.primary },
  friend: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  amount: { fontSize: FontSize.display, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, ...Shadow.card },
  breakdown: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    ...Shadow.card,
  },
  breakdownDivider: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  figure: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm },
  figureLabel: { fontSize: FontSize.caption, color: Colors.textMuted },
  figureValue: { fontSize: FontSize.bodyLarge, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xs },
  noteText: { flex: 1, fontSize: FontSize.caption, color: Colors.textMuted, lineHeight: 17 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: { fontSize: FontSize.caption, color: Colors.textMuted },
  detailValue: { fontSize: FontSize.body, fontWeight: '600', color: Colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 64 },
  repaidNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.successSoft,
  },
  repaidText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.successText },
});
