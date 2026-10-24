// Response shapes of the MiniLedger API (backend/src/routes, backend/src/services).
// Amounts are decimal strings with 2 places ("1250.00"); dates are "YYYY-MM-DD";
// timestamps are ISO 8601 strings.

export interface User {
  id: string;
  phone: string;
  name: string | null;
  /** When the phone number was last proven with a one-time code (null if never). */
  phoneVerifiedAt: string | null;
  createdAt: string;
}

export type LoanStatus = 'PENDING' | 'REPAID';
export type LoanFilter = LoanStatus | 'OVERDUE';
/** `recent`: newest first. `dueDate`: soonest due first. */
export type LoanSort = 'recent' | 'dueDate';

export interface Loan {
  id: string;
  friendName: string;
  amount: string;
  dueDate: string;
  status: LoanStatus;
  /** Computed by the server: PENDING and due date before today in the server's APP_TIMEZONE. */
  isOverdue: boolean;
  daysOverdue: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoanListResponse {
  loans: Loan[];
  nextCursor: string | null;
  /** The date the server used as "today". */
  asOf: string;
}

export interface LoanResponse {
  loan: Loan;
}

export interface DashboardSummary {
  currency: 'INR';
  totalLent: string;
  totalRepaid: string;
  outstanding: string;
  overdueAmount: string;
  activeLoans: number;
  overdueLoans: number;
  repaidLoans: number;
  totalLoans: number;
  asOf: string;
  timeZone: string;
}

export interface DashboardSummaryResponse {
  summary: DashboardSummary;
}

export interface SendOtpResponse {
  message: string;
  phone: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  /** "sms": sent by text message (Twilio Verify). "log": development server, printed in its log. */
  delivery: 'sms' | 'log';
}

export interface PhoneVerificationStatus {
  phone: string;
  verified: boolean;
  verifiedAt: string | null;
  /** A phone-change code that was sent and can still be entered. */
  pending: { phone: string; expiresAt: string; resendAvailableInSeconds: number } | null;
  /** False when the server cannot send codes (SMS not configured). */
  available: boolean;
}

export interface PhoneVerificationCheckResponse {
  message: string;
  user: User;
}

export interface VerifyOtpResponse {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  isNewUser: boolean;
  user: User;
}

export interface MeResponse {
  user: User;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface CreateLoanInput {
  friendName: string;
  amount: string;
  dueDate: string;
}
