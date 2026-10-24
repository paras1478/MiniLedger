import { ArrowLeft, CircleAlert, Lock, MessageSquareText, ShieldCheck, Wallet } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sendOtp, verifyOtp } from '@/api/endpoints';
import { DevDeliveryNotice } from '@/components/auth/delivery-notice';
import { OtpInput } from '@/components/auth/otp-input';
import { PhoneInput } from '@/components/auth/phone-input';
import { AppButton } from '@/components/ui/app-button';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useCountdown } from '@/hooks/use-countdown';
import { formatPhone } from '@/lib/format';
import { formatCountdown, otpErrorMessage, phoneInputError, retryAfterSeconds, toE164 } from '@/lib/phone';

const CODE_LENGTH = 6;

export default function LoginScreen() {
  const { signIn, notice } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useCountdown();
  /** "log": development server without SMS; the code is in the API terminal. */
  const [delivery, setDelivery] = useState<'sms' | 'log'>('sms');
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  const requestCode = async (target: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendOtp(target);
      setPhone(result.phone);
      setDelivery(result.delivery);
      setCode('');
      setStep('code');
      setResendIn(result.resendAvailableInSeconds);
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (caught) {
      setError(otpErrorMessage(caught));
      const retry = retryAfterSeconds(caught);
      if (retry > 0) setResendIn(retry);
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = () => {
    const invalid = phoneInputError(phoneInput);
    if (invalid) {
      setError(invalid);
      return;
    }
    void requestCode(toE164(phoneInput));
  };

  const submitCode = async (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await verifyOtp(phone, value);
      await signIn(token, user); // the navigator switches to the app
    } catch (caught) {
      setError(otpErrorMessage(caught));
      setCode('');
      setBusy(false);
    }
  };

  const onCodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void submitCode(digits);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'code' && (
            <Pressable
              onPress={() => {
                setStep('phone');
                setError(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Change phone number"
              style={styles.back}>
              <ArrowLeft size={22} color={Colors.primary} />
            </Pressable>
          )}

          <View style={styles.brand}>
            <View style={styles.logoRow}>
              <View style={styles.logo}>
                <Wallet size={22} color={Colors.textOnPrimary} strokeWidth={2.25} />
              </View>
              <Text style={styles.appName}>MiniLedger</Text>
            </View>
            <Text style={styles.headline} accessibilityRole="header">
              Your money, under control.
            </Text>
            <Text style={styles.tagline}>
              Track money you lend to friends: who owes you, how much, and when it’s due.
            </Text>
          </View>

          {notice && step === 'phone' && (
            <View style={styles.notice} accessibilityRole="alert">
              <CircleAlert size={18} color={Colors.warningText} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          )}

          <View style={styles.card}>
            {step === 'phone' ? (
              <>
                <Text style={styles.title}>Sign in with your phone</Text>
                <Text style={styles.subtitle}>We’ll send a 6-digit one-time password (OTP).</Text>
                <Text style={styles.label} nativeID="phoneLabel">
                  Mobile number
                </Text>
                <PhoneInput
                  value={phoneInput}
                  onChangeText={(text) => {
                    setPhoneInput(text);
                    setError(null);
                  }}
                  onSubmitEditing={submitPhone}
                  hasError={!!error}
                  labelledBy="phoneLabel"
                />
              </>
            ) : (
              <>
                <Text style={styles.title}>Enter verification code</Text>
                <Text style={styles.subtitle}>
                  {delivery === 'sms'
                    ? `Sent by SMS to ${formatPhone(phone)}. It can take up to a minute.`
                    : `For ${formatPhone(phone)}`}
                </Text>
                <View style={styles.codeWrap}>
                  <OtpInput
                    ref={codeInput}
                    value={code}
                    length={CODE_LENGTH}
                    onChangeText={onCodeChange}
                    hasError={!!error}
                    editable={!busy}
                  />
                </View>
                {delivery === 'log' && <DevDeliveryNotice />}
              </>
            )}

            {error && (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            )}

            {step === 'phone' ? (
              <AppButton
                label="Send OTP"
                icon={MessageSquareText}
                variant="brand"
                onPress={submitPhone}
                loading={busy}
                disabled={!phoneInput.trim()}
              />
            ) : (
              <>
                <AppButton
                  label="Verify and continue"
                  icon={ShieldCheck}
                  variant="brand"
                  onPress={() => void submitCode()}
                  loading={busy}
                  disabled={code.length !== CODE_LENGTH}
                />
                <Pressable
                  onPress={() => void requestCode(phone)}
                  disabled={resendIn > 0 || busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: resendIn > 0 || busy }}
                  style={styles.resend}>
                  <Text style={[styles.resendText, (resendIn > 0 || busy) && styles.resendDisabled]}>
                    {resendIn > 0 ? `Resend OTP in ${formatCountdown(resendIn)}` : 'Resend OTP'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.secure}>
            <Lock size={14} color={Colors.textMuted} />
            <Text style={styles.secureText}>Your session is stored securely on this device.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.xl,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  back: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  brand: { gap: Spacing.sm, marginTop: Spacing.xxxl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  logo: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.raised,
  },
  appName: { fontSize: FontSize.title, fontWeight: '800', color: Colors.primary, letterSpacing: -0.3 },
  headline: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: Colors.primary, letterSpacing: -0.8 },
  tagline: { fontSize: FontSize.bodyLarge, lineHeight: 23, color: Colors.textMuted },
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningSoft,
  },
  noticeText: { flex: 1, fontSize: FontSize.small, color: Colors.warningText },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xxl, gap: Spacing.md, ...Shadow.card },
  title: { fontSize: FontSize.title + 2, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.body, color: Colors.textMuted, marginTop: -Spacing.xs },
  label: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text, marginTop: Spacing.sm },
  codeWrap: { marginTop: Spacing.sm },
  error: { fontSize: FontSize.small, color: Colors.dangerText, fontWeight: '500' },
  resend: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  resendText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.brandText },
  resendDisabled: { color: Colors.textMuted },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  secureText: { fontSize: FontSize.caption, color: Colors.textMuted },
});
