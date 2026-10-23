import { router } from 'expo-router';
import { CalendarDays, Check, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
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

import { createLoan } from '@/api/endpoints';
import { AppButton } from '@/components/ui/app-button';
import { CalendarPicker } from '@/components/ui/calendar-picker';
import { useToast } from '@/components/ui/toast';
import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatDate, formatINR, localDateOnly } from '@/lib/format';

const QUICK_DUE_DATES = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];
const MAX_AMOUNT = 9_999_999_999.99;

type Field = 'friendName' | 'amount' | 'dueDate';

/** "30/11/2026" -> "2026-11-30", or null if it is not a real date. */
function parseDisplayDate(value: string): string | null {
  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toDisplayDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-');
  return `${d}/${m}/${y}`;
}

export default function AddLoanScreen() {
  const { authRequest } = useAuth();
  const showToast = useToast();
  const [friendName, setFriendName] = useState('');
  const [amount, setAmount] = useState('');
  const [dateInput, setDateInput] = useState(toDisplayDate(localDateOnly(30)));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // State updates are async, so a fast double tap could pass a `saving` check twice.
  const submitting = useRef(false);

  const dueDate = parseDisplayDate(dateInput);
  const isPastDue = dueDate !== null && dueDate < localDateOnly();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const validate = (): Partial<Record<Field, string>> => {
    const next: Partial<Record<Field, string>> = {};
    if (!friendName.trim()) next.friendName = "Enter your friend's name.";
    else if (friendName.trim().length > 100) next.friendName = 'Name must be at most 100 characters.';
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) next.amount = 'Enter an amount greater than ₹0.';
    else if (Number(amount) > MAX_AMOUNT) next.amount = 'That amount is too large.';
    if (!dueDate) next.dueDate = 'Enter a valid date as DD/MM/YYYY.';
    return next;
  };

  const save = async () => {
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !dueDate || submitting.current) return;

    submitting.current = true;
    setSaving(true);
    try {
      const { loan } = await createLoan(authRequest, { friendName: friendName.trim(), amount, dueDate });
      showToast(`Saved: ${formatINR(loan.amount)} lent to ${loan.friendName}`);
      close(); // the dashboard and loans list refresh when they regain focus
    } catch (caught) {
      submitting.current = false;
      setSaving(false);
      if (!(caught instanceof ApiError)) return setFormError('Something went wrong. Please try again.');
      if (caught.isAuthError) return; // signed out by AuthProvider
      const fieldErrors = caught.fieldErrors;
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors as Partial<Record<Field, string>>);
      else setFormError(caught.message);
    }
  };

  const onAmountChange = (text: string) => {
    // Digits and one decimal point with at most two decimals.
    const cleaned = text.replace(/[^\d.]/g, '');
    const [int = '', ...rest] = cleaned.split('.');
    setAmount(rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int);
    setErrors((e) => ({ ...e, amount: undefined }));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={styles.iconButton}>
          <X size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Add Loan
        </Text>
        <View style={styles.iconButton} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label} nativeID="friendLabel">
              Friend’s name
            </Text>
            <TextInput
              value={friendName}
              onChangeText={(text) => {
                setFriendName(text);
                setErrors((e) => ({ ...e, friendName: undefined }));
              }}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor={Colors.placeholder}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              maxLength={100}
              accessibilityLabelledBy="friendLabel"
              accessibilityLabel="Friend's name"
              style={[styles.input, errors.friendName && styles.inputError]}
            />
            {errors.friendName && <Text style={styles.error}>{errors.friendName}</Text>}

            <Text style={styles.label} nativeID="amountLabel">
              Amount
            </Text>
            <View style={[styles.amountRow, errors.amount && styles.inputError]}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={onAmountChange}
                placeholder="0"
                placeholderTextColor={Colors.placeholder}
                keyboardType="decimal-pad"
                accessibilityLabelledBy="amountLabel"
                accessibilityLabel="Amount in rupees"
                style={styles.amountInput}
              />
            </View>
            {errors.amount && <Text style={styles.error}>{errors.amount}</Text>}

            <Text style={styles.label} nativeID="dueLabel">
              Due date
            </Text>
            <View style={styles.chips}>
              {QUICK_DUE_DATES.map(({ label, days }) => {
                const value = toDisplayDate(localDateOnly(days));
                const selected = value === dateInput;
                return (
                  <Pressable
                    key={label}
                    onPress={() => {
                      setDateInput(value);
                      setErrors((e) => ({ ...e, dueDate: undefined }));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Due in ${label}`}
                    accessibilityState={{ selected }}
                    style={[styles.chip, selected && styles.chipSelected]}>
                    {selected && <Check size={14} color={Colors.textOnPrimary} strokeWidth={3} />}
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.dateRow, errors.dueDate && styles.inputError]}>
              <TextInput
                value={dateInput}
                onChangeText={(text) => {
                  setDateInput(text.replace(/[^\d/]/g, '').slice(0, 10));
                  setErrors((e) => ({ ...e, dueDate: undefined }));
                }}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={Colors.placeholder}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                accessibilityLabelledBy="dueLabel"
                accessibilityLabel="Due date, day month year"
                style={styles.dateInput}
              />
              <Pressable
                onPress={() => setCalendarOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Pick due date from calendar"
                style={({ pressed }) => [styles.calendarButton, pressed && styles.calendarButtonPressed]}>
                <CalendarDays size={18} color={Colors.brandText} />
                <Text style={styles.calendarButtonText}>Calendar</Text>
              </Pressable>
            </View>
            {errors.dueDate ? (
              <Text style={styles.error}>{errors.dueDate}</Text>
            ) : (
              dueDate && (
                <Text style={[styles.hint, isPastDue && styles.hintWarning]}>
                  {isPastDue
                    ? `${formatDate(dueDate)} is in the past, so this loan will show as overdue.`
                    : `Due on ${formatDate(dueDate)}`}
                </Text>
              )
            )}
          </View>

          {formError && (
            <Text style={[styles.error, styles.formError]} accessibilityRole="alert">
              {formError}
            </Text>
          )}

          <AppButton label="Save Loan" variant="brand" icon={Check} onPress={() => void save()} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>

      <CalendarPicker
        visible={calendarOpen}
        value={dueDate}
        onClose={() => setCalendarOpen(false)}
        onSelect={(date) => {
          setDateInput(toDisplayDate(date));
          setErrors((e) => ({ ...e, dueDate: undefined }));
          setCalendarOpen(false);
        }}
      />
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
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.sm, ...Shadow.card },
  label: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text, marginTop: Spacing.sm },
  input: {
    minHeight: TOUCH_TARGET + 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSize.bodyLarge,
    color: Colors.text,
  },
  inputError: { borderColor: Colors.danger },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  rupee: { fontSize: 26, fontWeight: '700', color: Colors.textMuted },
  // minWidth 0: a web <input> otherwise keeps its intrinsic ~20ch width and overflows the card.
  amountInput: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: '800', color: Colors.text, paddingVertical: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 38,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  chipText: { fontSize: FontSize.small, fontWeight: '600', color: Colors.text },
  chipTextSelected: { color: Colors.textOnPrimary },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TOUCH_TARGET + 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
  },
  dateInput: { flex: 1, minWidth: 0, fontSize: FontSize.bodyLarge, color: Colors.text, paddingVertical: Spacing.md },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brandSoft,
  },
  calendarButtonPressed: { backgroundColor: '#DDE3FC' },
  calendarButtonText: { fontSize: FontSize.small, fontWeight: '700', color: Colors.brandText },
  hint: { fontSize: FontSize.small, color: Colors.textMuted },
  hintWarning: { color: Colors.dangerText },
  error: { fontSize: FontSize.small, color: Colors.dangerText, fontWeight: '500' },
  formError: { textAlign: 'center' },
});
