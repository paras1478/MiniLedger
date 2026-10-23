import { HandCoins, Plus, Users, Wallet } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';

/** Shown when the user has not recorded any loans yet. */
export function DashboardEmptyState({ onAddLoan }: { onAddLoan: () => void }) {
  return (
    <View style={styles.container}>
      <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.bubble, styles.bubbleLeft]}>
          <Users size={20} color={Colors.primary} />
        </View>
        <View style={styles.main}>
          <Wallet size={36} color={Colors.textOnPrimary} strokeWidth={1.75} />
        </View>
        <View style={[styles.bubble, styles.bubbleRight]}>
          <HandCoins size={20} color={Colors.success} />
        </View>
      </View>

      <Text style={styles.title} accessibilityRole="header">
        Your ledger starts here.
      </Text>
      <Text style={styles.text}>Keep track of every rupee you lend.</Text>

      <AppButton label="Add Your First Loan" icon={Plus} variant="brand" onPress={onAddLoan} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  illustration: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  main: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  bubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.surface,
  },
  bubbleLeft: { backgroundColor: Colors.primarySoft, marginRight: -10, marginTop: 30 },
  bubbleRight: { backgroundColor: Colors.successSoft, marginLeft: -10, marginTop: 30 },
  title: { fontSize: FontSize.heading, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  text: { fontSize: FontSize.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  button: { marginTop: Spacing.lg, alignSelf: 'stretch' },
});
