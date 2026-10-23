import { router } from 'expo-router';
import { ArrowDownUp, Plus, Receipt, Search, SearchX, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listLoans, repayLoan } from '@/api/endpoints';
import type { Loan, LoanFilter, LoanSort } from '@/api/types';
import { LoanCard } from '@/components/loans/loan-card';
import { AppButton } from '@/components/ui/app-button';
import { ErrorState, StaleDataBanner } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusedQuery } from '@/hooks/use-focused-query';
import { ApiError } from '@/lib/api-client';
import { confirmAction, showError } from '@/lib/dialogs';
import { formatINR } from '@/lib/format';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

type Filter = 'ALL' | LoanFilter;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REPAID', label: 'Repaid' },
  { value: 'OVERDUE', label: 'Overdue' },
];
const EMPTY_TEXT: Record<Filter, string> = {
  ALL: "You haven't recorded any loans yet.",
  PENDING: 'No pending loans. Everyone has paid you back!',
  OVERDUE: 'Nothing is overdue.',
  REPAID: 'No loans have been repaid yet.',
};
const SORT_LABEL: Record<LoanSort, string> = { recent: 'Most recent', dueDate: 'Due date' };

export default function LoansScreen() {
  const { authRequest } = useAuth();
  const showToast = useToast();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<LoanSort>('recent');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Search on the server (so it covers every page), once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params = useMemo(
    () => ({ status: filter === 'ALL' ? undefined : filter, q: search || undefined, sort, limit: PAGE_SIZE }),
    [filter, search, sort]
  );
  const fetchLoans = useCallback(
    (signal: AbortSignal) => listLoans(authRequest, params, signal),
    [authRequest, params]
  );
  const { data, error, isLoading, isRefreshing, refresh, setData } = useFocusedQuery(fetchLoans, {
    keepPreviousData: true,
  });

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || isLoadingMore || isLoading) return;
    setIsLoadingMore(true);
    try {
      const next = await listLoans(authRequest, { ...params, cursor: data.nextCursor });
      setData((current) => current && { ...next, loans: [...current.loans, ...next.loans] });
    } catch (caught) {
      if (caught instanceof ApiError && !caught.isAuthError) showError("Couldn't load more loans", caught.message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [authRequest, data, params, isLoading, isLoadingMore, setData]);

  const markRepaid = useCallback(
    async (loan: Loan) => {
      setUpdatingId(loan.id);
      try {
        const { loan: updated } = await repayLoan(authRequest, loan.id);
        setData(
          (current) =>
            current && {
              ...current,
              // Under the Pending/Overdue filters a repaid loan no longer belongs in the list.
              loans:
                filter === 'PENDING' || filter === 'OVERDUE'
                  ? current.loans.filter((l) => l.id !== updated.id)
                  : current.loans.map((l) => (l.id === updated.id ? updated : l)),
            }
        );
        showToast(`${updated.friendName}'s loan marked as repaid`);
      } catch (caught) {
        if (caught instanceof ApiError && caught.isAuthError) return; // handled by sign-out
        const message = caught instanceof ApiError ? caught.message : 'Please try again.';
        showError("Couldn't update loan", message);
        if (caught instanceof ApiError && caught.status === 409) refresh();
      } finally {
        setUpdatingId(null);
      }
    },
    [authRequest, filter, refresh, setData, showToast]
  );

  const confirmRepaid = useCallback(
    (loan: Loan) =>
      confirmAction(
        'Mark as repaid?',
        `${formatINR(loan.amount)} from ${loan.friendName} will be marked as repaid.`,
        'Mark repaid',
        () => void markRepaid(loan)
      ),
    [markRepaid]
  );

  const openLoan = useCallback(
    (loan: Loan) => router.push({ pathname: '/loans/[id]', params: { id: loan.id } }),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: Loan }) => (
      <LoanCard loan={item} onPress={openLoan} onMarkRepaid={confirmRepaid} isUpdating={updatingId === item.id} />
    ),
    [confirmRepaid, openLoan, updatingId]
  );

  const goToAddLoan = () => router.push('/loans/new');

  let body: React.ReactNode = null;
  if (isLoading && !data) {
    body = (
      <View style={styles.list} accessibilityLabel="Loading loans" accessibilityRole="progressbar">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={84} radius={Radius.lg} />
        ))}
      </View>
    );
  } else if (!data) {
    body = error && (
      <View style={styles.list}>
        <ErrorState error={error} onRetry={refresh} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={data.loans}
        keyExtractor={(loan) => loan.id}
        renderItem={renderItem}
        extraData={updatingId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListHeaderComponent={error ? <StaleDataBanner error={error} onRetry={refresh} /> : undefined}
        ListEmptyComponent={
          search ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <SearchX size={28} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyText}>No loans to a friend named “{search}”.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Receipt size={28} color={Colors.primary} />
              </View>
              <Text style={styles.emptyText}>{EMPTY_TEXT[filter]}</Text>
              {filter === 'ALL' && (
                <AppButton label="Add Your First Loan" icon={Plus} variant="brand" onPress={goToAddLoan} />
              )}
            </View>
          )
        }
        ListFooterComponent={
          data.nextCursor ? (
            <AppButton label="Load more" variant="secondary" loading={isLoadingMore} onPress={() => void loadMore()} />
          ) : undefined
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        initialNumToRender={8}
        windowSize={7}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Loans
        </Text>
        <Pressable
          onPress={goToAddLoan}
          accessibilityRole="button"
          accessibilityLabel="Add new loan"
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
          <Plus size={22} color={Colors.textOnPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search by friend’s name"
            placeholderTextColor={Colors.placeholder}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={100}
            accessibilityLabel="Search loans by friend's name"
            style={styles.searchInput}
          />
          {isLoading && data ? (
            <ActivityIndicator size="small" color={Colors.brand} />
          ) : (
            searchInput.length > 0 && (
              <Pressable
                onPress={() => setSearchInput('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                style={styles.clear}>
                <X size={16} color={Colors.textMuted} />
              </Pressable>
            )
          )}
        </View>
        <Pressable
          onPress={() => setSort((s) => (s === 'recent' ? 'dueDate' : 'recent'))}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${SORT_LABEL[sort]}`}
          accessibilityHint={`Switches to sort by ${SORT_LABEL[sort === 'recent' ? 'dueDate' : 'recent']}`}
          style={({ pressed }) => [styles.sort, pressed && styles.sortPressed]}>
          <ArrowDownUp size={16} color={Colors.brandText} />
          <Text style={styles.sortText}>{SORT_LABEL[sort]}</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersScroll}>
        {FILTERS.map(({ value, label }) => {
          const selected = value === filter;
          return (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected, value === 'OVERDUE' && !selected && styles.chipOverdue]}>
              <Text
                style={[
                  styles.chipText,
                  value === 'OVERDUE' && styles.chipTextOverdue,
                  selected && styles.chipTextSelected,
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  title: { fontSize: FontSize.heading + 4, fontWeight: '800', color: Colors.primary },
  addButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.brand,
  },
  addButtonPressed: { backgroundColor: Colors.brandPressed },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // minWidth 0: a web <input> otherwise keeps its intrinsic width and pushes the sort button off-screen.
  searchInput: { flex: 1, minWidth: 0, fontSize: FontSize.body, color: Colors.text, paddingVertical: Spacing.sm },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  sort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.brandSoft,
  },
  sortPressed: { opacity: 0.7 },
  sortText: { fontSize: FontSize.small, fontWeight: '700', color: Colors.brandText },
  filtersScroll: { flexGrow: 0 },
  filters: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  chip: {
    minHeight: 38,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipOverdue: { borderColor: '#FECACA' },
  chipText: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text },
  chipTextOverdue: { color: Colors.dangerText },
  chipTextSelected: { color: Colors.textOnPrimary },
  body: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: FontSize.body, color: Colors.textMuted, textAlign: 'center' },
});
