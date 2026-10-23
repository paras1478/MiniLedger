import { UserRound, Wallet } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { formatPhone, getGreeting } from '@/lib/format';

interface DashboardHeaderProps {
  phone: string | null;
  onProfilePress: () => void;
}

export function DashboardHeader({ phone, onProfilePress }: DashboardHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Wallet size={22} color={Colors.textOnPrimary} strokeWidth={2.25} />
      </View>

      <View style={styles.titles}>
        <Text style={styles.greeting} numberOfLines={1}>
          {getGreeting()}
        </Text>
        <Text style={styles.appName} accessibilityRole="header">
          MiniLedger
        </Text>
      </View>

      <Pressable
        onPress={onProfilePress}
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
        accessibilityHint={phone ? `Signed in as ${formatPhone(phone)}` : undefined}
        hitSlop={6}
        style={({ pressed }) => [styles.profile, pressed && styles.profilePressed]}>
        {phone && (
          <Text style={styles.phone} numberOfLines={1}>
            {formatPhone(phone)}
          </Text>
        )}
        <View style={styles.avatar}>
          <UserRound size={20} color={Colors.primary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  logo: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1 },
  greeting: { fontSize: FontSize.small, color: Colors.textMuted },
  appName: { fontSize: FontSize.title, fontWeight: '800', color: Colors.primary, letterSpacing: -0.3 },
  profile: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 1,
  },
  profilePressed: { backgroundColor: Colors.primarySoft },
  phone: { fontSize: FontSize.caption, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
