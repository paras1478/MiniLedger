import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing, TOUCH_TARGET } from '@/constants/theme';

interface PhoneInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  hasError?: boolean;
  editable?: boolean;
  /** nativeID of the visible label, for screen readers. */
  labelledBy?: string;
  accessibilityLabel?: string;
}

/** Mobile number field with a "+91" country code, which disappears once the user types their own "+". */
export function PhoneInput({
  value,
  onChangeText,
  onSubmitEditing,
  hasError = false,
  editable = true,
  labelledBy,
  accessibilityLabel = 'Mobile number',
}: PhoneInputProps) {
  return (
    <View style={[styles.row, hasError && styles.rowError]}>
      {!value.startsWith('+') && <Text style={styles.prefix}>+91</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="98765 43210"
        placeholderTextColor={Colors.placeholder}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="send"
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        maxLength={16}
        accessibilityLabelledBy={labelledBy}
        accessibilityLabel={accessibilityLabel}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET + 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  rowError: { borderColor: Colors.danger },
  prefix: { fontSize: FontSize.bodyLarge, fontWeight: '600', color: Colors.text },
  // minWidth 0: a web <input> otherwise keeps its intrinsic width and overflows the row.
  input: { flex: 1, minWidth: 0, fontSize: FontSize.bodyLarge, color: Colors.text, paddingVertical: Spacing.md },
});
