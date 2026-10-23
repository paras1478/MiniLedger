const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an API amount string ("125000.50") as Indian Rupees ("₹1,25,000.50").
 * Works on the decimal string directly, so there is no floating-point rounding and no
 * dependence on the device's Intl support. Whole amounts drop the ".00".
 */
export function formatINR(amount: string): string {
  const [rawInt = '0', rawFrac = ''] = amount.replace(/^-/, '').split('.');
  const negative = amount.startsWith('-');
  const int = rawInt.replace(/^0+(?=\d)/, '');
  // Indian grouping: last three digits, then groups of two (1,25,000 / 1,28,50,000).
  const lastThree = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  const frac = rawFrac.padEnd(2, '0').slice(0, 2);
  return `${negative ? '-' : ''}₹${grouped}${frac === '00' ? '' : `.${frac}`}`;
}

/** "2026-11-30" -> "30 Nov 2026". Parsed by hand so the date never shifts with the timezone. */
export function formatDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (!y || !m || !d) return dateOnly;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Local calendar date as "YYYY-MM-DD", optionally offset by whole days. */
export function localDateOnly(offsetDays = 0, from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** "Rahul Sharma" -> "RS", "asha" -> "A". */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.[0]];
  return letters.join('').toUpperCase() || '?';
}

export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "+919876543210" -> "+91 98765 43210"; other countries are shown as stored. */
export function formatPhone(phone: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return india ? `+91 ${india[1]} ${india[2]}` : phone;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
