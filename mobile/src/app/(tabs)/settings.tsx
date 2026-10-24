import Constants from 'expo-constants';
import { router } from 'expo-router';
import { BadgeCheck, ChevronRight, Info, LogOut, Phone, Server, ShieldCheck, Smartphone, UserRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/app-button';
import { API_URL } from '@/constants/config';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { confirmAction } from '@/lib/dialogs';
import { formatPhone } from '@/lib/format';

function InfoRow({ icon: Icon, label, value, accessory }: { icon: LucideIcon; label: string; value: string; accessory?: ReactNode }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.rowIcon}>
        <Icon size={18} color={Colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {accessory}
    </View>
  );
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const memberSince = user ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : null;

  const confirmSignOut = () =>
    confirmAction('Sign out?', 'You will need a new verification code to sign in again.', 'Sign out', () => void signOut());

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <UserRound size={28} color={Colors.textOnPrimary} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{user?.name ?? 'MiniLedger user'}</Text>
            {user && <Text style={styles.profilePhone}>{formatPhone(user.phone)}</Text>}
            {memberSince && <Text style={styles.memberSince}>Member since {memberSince}</Text>}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <InfoRow
            icon={Phone}
            label="Phone number"
            value={user ? formatPhone(user.phone) : '-'}
            accessory={
              user?.phoneVerifiedAt ? (
                <View style={styles.verified} accessibilityLabel="Verified">
                  <BadgeCheck size={14} color={Colors.successText} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : (
                <View style={styles.unverified}>
                  <Text style={styles.unverifiedText}>Not verified</Text>
                </View>
              )
            }
          />
          <View style={styles.divider} />
          <Pressable
            onPress={() => router.push('/verify-phone')}
            accessibilityRole="button"
            accessibilityLabel="Verify or change phone number"
            style={({ pressed }) => [styles.row, styles.actionRow, pressed && styles.actionRowPressed]}>
            <View style={styles.rowIcon}>
              <Smartphone size={18} color={Colors.primary} />
            </View>
            <Text style={[styles.rowText, styles.actionText]}>Verify or change number</Text>
            <ChevronRight size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.divider} />
          <InfoRow icon={ShieldCheck} label="Sign-in method" value="One-time code (OTP)" />
        </View>

        <Text style={styles.sectionLabel}>App</Text>
        <View style={styles.card}>
          <InfoRow icon={Server} label="API server" value={API_URL} />
          <View style={styles.divider} />
          <InfoRow icon={Info} label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        </View>

        <AppButton label="Sign out" icon={LogOut} variant="danger" onPress={confirmSignOut} style={styles.signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  title: { fontSize: FontSize.heading + 4, fontWeight: '800', color: Colors.primary, marginBottom: Spacing.xs },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    ...Shadow.raised,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: FontSize.title, fontWeight: '700', color: Colors.textOnPrimary },
  profilePhone: { fontSize: FontSize.body, color: Colors.textOnPrimary },
  memberSince: { fontSize: FontSize.caption, color: Colors.textOnPrimaryMuted },
  sectionLabel: {
    marginTop: Spacing.md,
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, ...Shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: FontSize.caption, color: Colors.textMuted },
  rowValue: { fontSize: FontSize.body, fontWeight: '600', color: Colors.text },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.successSoft,
  },
  verifiedText: { fontSize: FontSize.caption, fontWeight: '700', color: Colors.successText },
  unverified: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill, backgroundColor: Colors.warningSoft },
  unverifiedText: { fontSize: FontSize.caption, fontWeight: '700', color: Colors.warningText },
  actionRow: { minHeight: TOUCH_TARGET + 16 },
  actionRowPressed: { backgroundColor: Colors.background },
  actionText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 64 },
  signOut: { marginTop: Spacing.xl },
});
