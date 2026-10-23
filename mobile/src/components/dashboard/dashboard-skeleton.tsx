import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

/** Mirrors the dashboard layout while the first load is in progress. */
export function DashboardSkeleton() {
  return (
    <View style={styles.container} accessibilityLabel="Loading your dashboard" accessibilityRole="progressbar">
      <Skeleton height={168} radius={Radius.xl} />
      {[0, 1].map((row) => (
        <View key={row} style={styles.row}>
          {[0, 1].map((col) => (
            <View key={col} style={styles.stat}>
              <Skeleton width={38} height={38} radius={19} />
              <Skeleton width="60%" height={12} style={styles.gap} />
              <Skeleton width="80%" height={22} />
            </View>
          ))}
        </View>
      ))}
      <Skeleton height={56} radius={Radius.lg} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.loan}>
          <Skeleton width={44} height={44} radius={22} />
          <View style={styles.loanText}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={70} height={16} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  stat: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  gap: { marginTop: Spacing.xs },
  loan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  loanText: { flex: 1, gap: Spacing.sm },
});
