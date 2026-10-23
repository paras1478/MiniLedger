import { router } from 'expo-router';
import { ChevronRight, CircleAlert, CircleCheck, Hourglass, Plus, Users } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDashboardSummary, listLoans } from '@/api/endpoints';
import type { Loan } from '@/api/types';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { QuickActionButton } from '@/components/dashboard/quick-action-button';
import { SummaryStatCard } from '@/components/dashboard/summary-stat-card';
import { TotalLentCard } from '@/components/dashboard/total-lent-card';
import { LoanCard } from '@/components/loans/loan-card';
import { ErrorState, StaleDataBanner } from '@/components/ui/error-state';
import { Colors, FontSize, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusedQuery } from '@/hooks/use-focused-query';
import { formatINR, pluralize } from '@/lib/format';

const RECENT_LOANS_LIMIT = 5;

const enter = (index: number) => FadeInDown.duration(320).delay(index * 50);

export default function DashboardScreen() {
  const { user, authRequest } = useAuth();

  // Summary and recent loans load in parallel, and reload whenever this tab regains focus
  // (e.g. after adding a loan or marking one repaid).
  const fetchDashboard = useCallback(
    async (signal: AbortSignal) => {
      const [{ summary }, { loans }] = await Promise.all([
        getDashboardSummary(authRequest, signal),
        listLoans(authRequest, { limit: RECENT_LOANS_LIMIT }, signal),
      ]);
      return { summary, recentLoans: loans };
    },
    [authRequest]
  );
  const { data, error, isLoading, isRefreshing, refresh } = useFocusedQuery(fetchDashboard);

  const goToAddLoan = () => router.push('/loans/new');
  const goToLoans = () => router.navigate('/loans');
  const openLoan = (loan: Loan) => router.push({ pathname: '/loans/[id]', params: { id: loan.id } });

  let content: React.ReactNode;
  if (isLoading && !data) {
    content = <DashboardSkeleton />;
  } else if (!data) {
    content = error ? <ErrorState error={error} onRetry={refresh} /> : null;
  } else if (data.summary.totalLoans === 0) {
    content = (
      <>
        {error && <StaleDataBanner error={error} onRetry={refresh} />}
        <Animated.View entering={enter(0)}>
          <DashboardEmptyState onAddLoan={goToAddLoan} />
        </Animated.View>
      </>
    );
  } else {
    const { summary, recentLoans } = data;
    const hasOverdue = summary.overdueLoans > 0;
    content = (
      <>
        {error && <StaleDataBanner error={error} onRetry={refresh} />}

        <Animated.View entering={enter(0)}>
          <TotalLentCard totalLent={summary.totalLent} totalLoans={summary.totalLoans} />
        </Animated.View>

        <Animated.View entering={enter(1)} style={styles.grid}>
          <View style={styles.gridRow}>
            <SummaryStatCard
              label="Total Repaid"
              value={formatINR(summary.totalRepaid)}
              icon={CircleCheck}
              tone="success"
              caption={pluralize(summary.repaidLoans, 'loan')}
            />
            <SummaryStatCard
              label="Outstanding"
              value={formatINR(summary.outstanding)}
              icon={Hourglass}
              tone="warning"
              caption="Still to be repaid"
            />
          </View>
          <View style={styles.gridRow}>
            <SummaryStatCard
              label="Overdue Amount"
              value={formatINR(summary.overdueAmount)}
              icon={CircleAlert}
              tone="danger"
              emphasizeValue={hasOverdue}
              caption={hasOverdue ? `${pluralize(summary.overdueLoans, 'loan')} overdue` : 'Nothing overdue'}
            />
            <SummaryStatCard
              label="Active Loans"
              value={String(summary.activeLoans)}
              icon={Users}
              tone="brand"
              caption="Pending repayment"
            />
          </View>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <QuickActionButton label="Add New Loan" icon={Plus} onPress={goToAddLoan} />
        </Animated.View>

        <Animated.View entering={enter(3)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Recent Loans
            </Text>
            <Pressable
              onPress={goToLoans}
              accessibilityRole="link"
              accessibilityLabel="View all loans"
              hitSlop={8}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}>
              <Text style={styles.viewAllText}>View All</Text>
              <ChevronRight size={16} color={Colors.brandText} strokeWidth={2.5} />
            </Pressable>
          </View>
          {recentLoans.map((loan) => (
            <LoanCard key={loan.id} loan={loan} onPress={openLoan} />
          ))}
          {summary.totalLoans > recentLoans.length && (
            <Text style={styles.moreText}>
              Showing {recentLoans.length} of {summary.totalLoans} loans
            </Text>
          )}
        </Animated.View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }>
        <DashboardHeader phone={user?.phone ?? null} onProfilePress={() => router.navigate('/settings')} />
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  grid: { gap: Spacing.md },
  gridRow: { flexDirection: 'row', gap: Spacing.md },
  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  viewAll: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing.xs },
  viewAllPressed: { opacity: 0.6 },
  viewAllText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.brandText },
  moreText: { fontSize: FontSize.small, color: Colors.textMuted, textAlign: 'center' },
});
