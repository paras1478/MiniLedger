import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import type { ApiError } from '@/lib/api-client';

const isOffline = (error: ApiError) => error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT';

/** Full-section error with a retry button, used when there is no data to show. */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const Icon = isOffline(error) ? WifiOff : CircleAlert;
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconCircle}>
        <Icon size={28} color={Colors.dangerText} />
      </View>
      <Text style={styles.title}>{isOffline(error) ? "You're offline" : "Couldn't load your ledger"}</Text>
      <Text style={styles.message}>{error.message}</Text>
      <AppButton label="Try again" icon={RefreshCw} onPress={onRetry} variant="secondary" style={styles.button} />
    </View>
  );
}

/** Slim banner shown above data that is still visible but failed to refresh. */
export function StaleDataBanner({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <CircleAlert size={18} color={Colors.warningText} />
      <Text style={styles.bannerText}>
        Couldn’t refresh, so these figures may be out of date. {isOffline(error) ? 'Check your connection.' : ''}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading"
        hitSlop={8}
        style={styles.bannerAction}>
        <Text style={styles.bannerActionText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  message: { fontSize: FontSize.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  button: { marginTop: Spacing.sm, alignSelf: 'stretch' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningSoft,
  },
  bannerText: { flex: 1, fontSize: FontSize.small, color: Colors.warningText, paddingVertical: Spacing.sm },
  bannerAction: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: Spacing.md },
  bannerActionText: { fontSize: FontSize.small, fontWeight: '700', color: Colors.warningText },
});
