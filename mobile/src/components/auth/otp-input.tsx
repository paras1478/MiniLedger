import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

interface OtpInputProps {
  value: string;
  length: number;
  onChangeText: (text: string) => void;
  hasError?: boolean;
  editable?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

/**
 * Six separate boxes drawn over one invisible TextInput. A single real input keeps SMS
 * autofill (Android/iOS one-time-code), paste and screen readers working as normal.
 */
export function OtpInput({ value, length, onChangeText, hasError = false, editable = true, ref }: OtpInputProps) {
  const activeIndex = Math.min(value.length, length - 1);
  return (
    <View style={styles.row}>
      {Array.from({ length }, (_, i) => {
        const digit = value[i];
        const active = editable && i === activeIndex && value.length < length;
        return (
          <View
            key={i}
            style={[styles.box, digit && styles.boxFilled, active && styles.boxActive, hasError && styles.boxError]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Text style={styles.digit}>{digit ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder="••••••"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={length}
        editable={editable}
        caretHidden
        accessibilityLabel={`${length}-digit verification code`}
        style={styles.hiddenInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 0.86,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: Colors.primary, backgroundColor: Colors.surface },
  boxActive: { borderColor: Colors.brand, backgroundColor: Colors.surface },
  boxError: { borderColor: Colors.danger },
  digit: { fontSize: 24, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  // Covers the boxes so a tap anywhere focuses it; opacity 0 hides text, caret and placeholder.
  hiddenInput: { ...StyleSheet.absoluteFill, opacity: 0, color: 'transparent' },
});
