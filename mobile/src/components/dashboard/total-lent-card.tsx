import { Wallet } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { formatINR, pluralize } from '@/lib/format';

interface TotalLentCardProps {
  totalLent: string;
  totalLoans: number;
}

/** The headline figure: everything ever lent (pending + repaid). Not an account balance. */
export function TotalLentCard({ totalLent, totalLoans }: TotalLentCardProps) {
  const amount = formatINR(totalLent);
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`Total lent ${amount} across ${pluralize(totalLoans, 'loan')}`}>
      {/* Decorative rings and icon */}
      <View style={[styles.ring, styles.ringLarge]} />
      <View style={[styles.ring, styles.ringSmall]} />
      <View style={styles.illustration}>
        <Wallet size={28} color={Colors.textOnPrimary} strokeWidth={1.75} />
      </View>

      <Text style={styles.label}>Total Lent</Text>
      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {amount}
      </Text>
      <Text style={styles.subtitle}>Money you’ve lent to friends.</Text>

      <View style={styles.pill}>
        <Text style={styles.pillText}>{pluralize(totalLoans, 'loan')} recorded</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    overflow: 'hidden',
    ...Shadow.raised,
  },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ringLarge: { width: 220, height: 220, right: -70, top: -90 },
  ringSmall: { width: 140, height: 140, right: -30, top: -50, backgroundColor: 'rgba(255,255,255,0.04)' },
  illustration: {
    position: 'absolute',
    right: Spacing.xxl,
    top: Spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(79,107,237,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: FontSize.body, fontWeight: '600', color: Colors.textOnPrimaryMuted },
  amount: {
    marginTop: Spacing.xs,
    marginRight: 64,
    fontSize: FontSize.display,
    fontWeight: '800',
    color: Colors.textOnPrimary,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  subtitle: { marginTop: Spacing.xs, fontSize: FontSize.small, color: Colors.textOnPrimaryMuted },
  pill: {
    marginTop: Spacing.lg,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pillText: { fontSize: FontSize.caption, fontWeight: '600', color: Colors.textOnPrimary },
});
