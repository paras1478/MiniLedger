/**
 * MiniLedger design tokens. Light theme only.
 * The brand colors (success #16A34A, warning #D97706, danger #DC2626) are used for icons,
 * fills and accents. Small text on a light background uses the darker "Text" variants so it
 * meets WCAG AA contrast (green and amber at their brand shade fall below 4.5:1 on white).
 */
export const Colors = {
  background: '#F7F8FC',
  surface: '#FFFFFF',
  border: '#E5E7EF',
  text: '#111827',
  textMuted: '#6B7280',
  textOnPrimary: '#FFFFFF',
  textOnPrimaryMuted: '#C7D2FE',

  /** Navy: hero card, headings, active tab. */
  primary: '#172554',
  primarySoft: '#EEF1FE',

  /** Blue: main calls to action and links. */
  brand: '#4F6BED',
  brandPressed: '#3B55D0',
  brandText: '#3B55D0',
  brandSoft: '#EEF1FE',

  success: '#16A34A',
  successText: '#15803D',
  successSoft: '#F0FDF4',

  warning: '#D97706',
  warningText: '#B45309',
  warningSoft: '#FFFBEB',

  danger: '#DC2626',
  dangerText: '#B91C1C',
  dangerSoft: '#FEF2F2',

  placeholder: '#9CA3AF',
  skeleton: '#E6E9F2',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const FontSize = {
  caption: 12,
  small: 13,
  body: 15,
  bodyLarge: 16,
  title: 18,
  heading: 22,
  display: 34,
} as const;

/** Minimum touch target (Material / Apple HIG). */
export const TOUCH_TARGET = 44;

export const Shadow = {
  card: { boxShadow: '0px 1px 2px rgba(17, 24, 39, 0.04), 0px 6px 16px rgba(17, 24, 39, 0.06)' },
  raised: { boxShadow: '0px 12px 28px rgba(23, 37, 84, 0.28)' },
  brand: { boxShadow: '0px 8px 20px rgba(79, 107, 237, 0.30)' },
} as const;

/** Muted avatar backgrounds; picked deterministically from a friend's name. */
export const AvatarColors = [
  { background: '#E0E7FF', text: '#3730A3' },
  { background: '#DCFCE7', text: '#166534' },
  { background: '#FCE7F3', text: '#9D174D' },
  { background: '#FEF3C7', text: '#92400E' },
  { background: '#E0F2FE', text: '#075985' },
  { background: '#F3E8FF', text: '#6B21A8' },
] as const;
