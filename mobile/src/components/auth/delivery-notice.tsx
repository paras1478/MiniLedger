import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

/**
 * Shown when the API answered `delivery: "log"`: it is running without Twilio, so no SMS was sent
 * and the code is only in the server terminal. Makes that impossible to miss.
 */
export function DevDeliveryNotice() {
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <CircleAlert size={18} color={Colors.warningText} />
      <Text style={styles.text}>
        <Text style={styles.strong}>No SMS was sent.</Text> The server is in development mode (Twilio Verify is not
        configured), so the code is printed in the backend terminal.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningSoft,
  },
  text: { flex: 1, fontSize: FontSize.small, lineHeight: 19, color: Colors.warningText },
  strong: { fontWeight: '700' },
});
