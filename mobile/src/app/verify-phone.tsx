import { router } from 'expo-router';
import { ArrowLeft, BadgeCheck, CircleAlert, MessageSquareText, ShieldCheck, X } from 'lucide-react-native';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
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

import { checkPhoneVerification, getPhoneVerificationStatus, sendPhoneVerification } from '@/api/endpoints';
import { DevDeliveryNotice } from '@/components/auth/delivery-notice';
import { OtpInput } from '@/components/auth/otp-input';
import { PhoneInput } from '@/components/auth/phone-input';
import { AppButton } from '@/components/ui/app-button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useCountdown } from '@/hooks/use-countdown';
import { useFocusedQuery } from '@/hooks/use-focused-query';
import { ApiError } from '@/lib/api-client';
import { formatDate, formatPhone, localDateOnly } from '@/lib/format';
import { formatCountdown, otpErrorMessage, phoneInputError, retryAfterSeconds, toE164 } from '@/lib/phone';

const CODE_LENGTH = 6;

/** Verify the signed-in user's number, or move the account to a new one, with an SMS code. */
export default function VerifyPhoneScreen() {
  const { user, authRequest, updateUser } = useAuth();
  const showToast = useToast();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<'sms' | 'log'>('sms');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useCountdown();
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);
  // Resume a code that was sent earlier (e.g. the screen was closed) only once per visit.
  const resumed = useRef(false);

  const fetchStatus = useCallback(
    async (signal: AbortSignal) => {
      const status = await getPhoneVerificationStatus(authRequest, signal);
      if (status.pending && !resumed.current) {
        resumed.current = true;
        setTarget(status.pending.phone);
        setResendIn(status.pending.resendAvailableInSeconds);
        setStep('code');
      }
      return status;
    },
    [authRequest, setResendIn]
  );
  const { data: status, error: statusError, isLoading, refresh } = useFocusedQuery(fetchStatus);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  const requestCode = async (phone: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendPhoneVerification(authRequest, phone);
      setTarget(result.phone);
      setDelivery(result.delivery);
      setCode('');
      setStep('code');
      setResendIn(result.resendAvailableInSeconds);
      // The notice on screen covers development mode; a success toast there would mislead.
      if (result.delivery === 'sms') showToast(`Code requested for ${formatPhone(result.phone)}`);
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (caught) {
      if (caught instanceof ApiError && caught.isAuthError) return; // signed out by AuthProvider
      setError(otpErrorMessage(caught));
      const retry = retryAfterSeconds(caught);
      if (retry > 0) setResendIn(retry);
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = () => {
    const invalid = phoneInputError(phoneInput);
    if (invalid) return setError(invalid);
    void requestCode(toE164(phoneInput));
  };

  const submitCode = async (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkPhoneVerification(authRequest, target, value);
      await updateUser(result.user);
      showToast(result.message);
      close();
    } catch (caught) {
      if (caught instanceof ApiError && caught.isAuthError) return;
      setError(otpErrorMessage(caught));
      setCode('');
      setBusy(false);
    }
  };

  const onCodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH) void submitCode(digits);
  };

  const verifiedAt = user?.phoneVerifiedAt ? formatDate(localDateOnly(0, new Date(user.phoneVerifiedAt))) : null;
  const unavailable = status?.available === false;

  let form: React.ReactNode;
  if (isLoading && !status) {
    form = <Skeleton height={220} radius={Radius.xl} />;
  } else if (!status && statusError) {
    form = <ErrorState error={statusError} onRetry={refresh} />;
  } else if (step === 'phone') {
    form = (
      <View style={styles.card}>
        <Text style={styles.title}>Verify a phone number</Text>
        <Text style={styles.subtitle}>
          Enter a new number to move your account to it, or your current number to verify it again. We’ll text
          it a 6-digit code.
        </Text>
        {unavailable && (
          <View style={styles.notice} accessibilityRole="alert">
            <CircleAlert size={18} color={Colors.warningText} />
            <Text style={styles.noticeText}>
              Text-message codes aren’t available on this server right now. Please try again later.
            </Text>
          </View>
        )}
        <Text style={styles.label} nativeID="newPhoneLabel">
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
          editable={!busy}
          labelledBy="newPhoneLabel"
          accessibilityLabel="Mobile number to verify"
        />
        <Text style={styles.hint}>Type + first to use a country code other than +91.</Text>
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <AppButton
          label={resendIn > 0 ? `Send OTP in ${formatCountdown(resendIn)}` : 'Send OTP'}
          icon={MessageSquareText}
          variant="brand"
          onPress={submitPhone}
          loading={busy}
          disabled={!phoneInput.trim() || unavailable || resendIn > 0}
        />
      </View>
    );
  } else {
    form = (
      <View style={styles.card}>
        <Pressable
          onPress={() => {
            setStep('phone');
            setError(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Use a different number"
          hitSlop={8}
          style={styles.backLink}>
          <ArrowLeft size={16} color={Colors.brandText} />
          <Text style={styles.backLinkText}>Different number</Text>
        </Pressable>
        <Text style={styles.title}>Enter verification code</Text>
        <Text style={styles.subtitle}>
          {delivery === 'sms'
            ? `Sent by SMS to ${formatPhone(target)}. It can take up to a minute.`
            : `For ${formatPhone(target)}`}
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
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <AppButton
          label="Verify number"
          icon={ShieldCheck}
          variant="brand"
          onPress={() => void submitCode()}
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
        />
        <Pressable
          onPress={() => void requestCode(target)}
          disabled={resendIn > 0 || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: resendIn > 0 || busy }}
          style={styles.resend}>
          <Text style={[styles.resendText, (resendIn > 0 || busy) && styles.resendDisabled]}>
            {resendIn > 0 ? `Resend OTP in ${formatCountdown(resendIn)}` : 'Resend OTP'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={styles.iconButton}>
          <X size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Phone number
        </Text>
        <View style={styles.iconButton} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {user && (
            <View style={styles.current} accessible accessibilityLabel={`Current number ${formatPhone(user.phone)}, ${verifiedAt ? `verified on ${verifiedAt}` : 'not verified'}`}>
              <View style={styles.currentText}>
                <Text style={styles.currentLabel}>Current number</Text>
                <Text style={styles.currentPhone}>{formatPhone(user.phone)}</Text>
              </View>
              {verifiedAt ? (
                <View style={[styles.badge, styles.badgeVerified]}>
                  <BadgeCheck size={14} color={Colors.successText} />
                  <Text style={[styles.badgeText, { color: Colors.successText }]}>Verified {verifiedAt}</Text>
                </View>
              ) : (
                <View style={[styles.badge, styles.badgeUnverified]}>
                  <CircleAlert size={14} color={Colors.warningText} />
                  <Text style={[styles.badgeText, { color: Colors.warningText }]}>Not verified</Text>
                </View>
              )}
            </View>
          )}
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  headerTitle: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  iconButton: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  currentText: { flex: 1, minWidth: 140 },
  currentLabel: { fontSize: FontSize.caption, color: Colors.textMuted },
  currentPhone: { fontSize: FontSize.bodyLarge, fontWeight: '700', color: Colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  badgeVerified: { backgroundColor: Colors.successSoft },
  badgeUnverified: { backgroundColor: Colors.warningSoft },
  badgeText: { fontSize: FontSize.caption, fontWeight: '700' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md, ...Shadow.card },
  title: { fontSize: FontSize.title + 2, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.body, lineHeight: 21, color: Colors.textMuted, marginTop: -Spacing.xs },
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningSoft,
  },
  noticeText: { flex: 1, fontSize: FontSize.small, color: Colors.warningText },
  label: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text, marginTop: Spacing.sm },
  hint: { fontSize: FontSize.caption, color: Colors.textMuted, marginTop: -Spacing.xs },
  codeWrap: { marginTop: Spacing.sm },
  error: { fontSize: FontSize.small, color: Colors.dangerText, fontWeight: '500' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  backLinkText: { fontSize: FontSize.small, fontWeight: '700', color: Colors.brandText },
  resend: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  resendText: { fontSize: FontSize.body, fontWeight: '600', color: Colors.brandText },
  resendDisabled: { color: Colors.textMuted },
});
