import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Colors, FontSize, Radius, Shadow, Spacing, TOUCH_TARGET } from '@/constants/theme';
import { localDateOnly } from '@/lib/format';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface CalendarPickerProps {
  visible: boolean;
  /** Selected date as "YYYY-MM-DD", or null. */
  value: string | null;
  onSelect: (dateOnly: string) => void;
  onClose: () => void;
}

const toDateOnly = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Month-grid date picker in a modal. Weeks start on Monday; past dates stay selectable. */
export function CalendarPicker({ visible, value, onSelect, onClose }: CalendarPickerProps) {
  const today = localDateOnly();
  const initial = (value ?? today).split('-').map(Number);
  const [view, setView] = useState({ year: initial[0]!, month: initial[1]! - 1 });

  // Re-open on the selected month each time the picker is shown.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setView({ year: initial[0]!, month: initial[1]! - 1 });
  }

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const leadingBlanks = (new Date(view.year, view.month, 1).getDay() + 6) % 7; // Monday first
  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close calendar" />
        <Animated.View entering={ZoomIn.duration(180)} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Pressable
              onPress={() => shift(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={styles.navButton}>
              <ChevronLeft size={22} color={Colors.primary} />
            </Pressable>
            <Text style={styles.monthTitle} accessibilityRole="header">
              {MONTHS[view.month]} {view.year}
            </Text>
            <Pressable
              onPress={() => shift(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={styles.navButton}>
              <ChevronRight size={22} color={Colors.primary} />
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((day, i) => (
              <Text key={i} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={i} style={styles.cell} />;
              const date = toDateOnly(view.year, view.month, day);
              const selected = date === value;
              const isToday = date === today;
              return (
                <Pressable
                  key={i}
                  onPress={() => onSelect(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${MONTHS[view.month]} ${view.year}${isToday ? ', today' : ''}`}
                  accessibilityState={{ selected }}
                  style={styles.cell}>
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.day,
                        isToday && styles.dayToday,
                        pressed && styles.dayPressed,
                        selected && styles.daySelected,
                      ]}>
                      <Text
                        style={[
                          styles.dayText,
                          date < today && styles.dayPast,
                          isToday && styles.dayTodayText,
                          selected && styles.daySelectedText,
                        ]}>
                        {day}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={() => onSelect(today)}
              accessibilityRole="button"
              style={styles.footerButton}>
              <Text style={styles.footerText}>Today</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.footerButton}>
              <Text style={[styles.footerText, styles.footerMuted]}>Cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadow.raised,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  navButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  monthTitle: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  week: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textMuted,
    paddingVertical: Spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: '86%', height: '86%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: Colors.brand },
  dayPressed: { backgroundColor: Colors.brandSoft },
  daySelected: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  dayText: { fontSize: FontSize.body, fontWeight: '500', color: Colors.text, fontVariant: ['tabular-nums'] },
  dayPast: { color: Colors.textMuted },
  dayTodayText: { color: Colors.brandText, fontWeight: '700' },
  daySelectedText: { color: Colors.textOnPrimary, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  footerButton: { minHeight: TOUCH_TARGET, paddingHorizontal: Spacing.md, justifyContent: 'center' },
  footerText: { fontSize: FontSize.body, fontWeight: '700', color: Colors.brandText },
  footerMuted: { color: Colors.textMuted },
});
