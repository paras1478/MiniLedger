import type {
  CreateLoanInput,
  DashboardSummaryResponse,
  LoanFilter,
  LoanListResponse,
  LoanSort,
  LoanResponse,
  MeResponse,
  PhoneVerificationCheckResponse,
  PhoneVerificationStatus,
  SendOtpResponse,
  VerifyOtpResponse,
} from '@/api/types';
import { apiRequest, type RequestOptions } from '@/lib/api-client';

/** Authenticated request function provided by AuthProvider (adds the token, handles 401). */
export type AuthRequest = <T>(path: string, options?: Omit<RequestOptions, 'token'>) => Promise<T>;

// Public endpoints
export const sendOtp = (phone: string) =>
  apiRequest<SendOtpResponse>('/auth/send-otp', { method: 'POST', body: { phone } });

export const verifyOtp = (phone: string, code: string) =>
  apiRequest<VerifyOtpResponse>('/auth/verify-otp', { method: 'POST', body: { phone, code } });

export const getMe = (token: string, signal?: AbortSignal) =>
  apiRequest<MeResponse>('/auth/me', { token, signal });

// Authenticated endpoints
export const getDashboardSummary = (request: AuthRequest, signal?: AbortSignal) =>
  request<DashboardSummaryResponse>('/dashboard/summary', { signal });

export function listLoans(
  request: AuthRequest,
  params: { status?: LoanFilter; limit?: number; cursor?: string | null; q?: string; sort?: LoanSort } = {},
  signal?: AbortSignal
) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.q) query.set('q', params.q);
  if (params.sort && params.sort !== 'recent') query.set('sort', params.sort);
  const qs = query.toString();
  return request<LoanListResponse>(`/loans${qs ? `?${qs}` : ''}`, { signal });
}

export const getLoan = (request: AuthRequest, loanId: string, signal?: AbortSignal) =>
  request<LoanResponse>(`/loans/${encodeURIComponent(loanId)}`, { signal });

export const createLoan = (request: AuthRequest, input: CreateLoanInput) =>
  request<LoanResponse>('/loans', { method: 'POST', body: input });

// Verifying or changing the signed-in user's phone number
export const getPhoneVerificationStatus = (request: AuthRequest, signal?: AbortSignal) =>
  request<PhoneVerificationStatus>('/phone-verification/status', { signal });

export const sendPhoneVerification = (request: AuthRequest, phone: string) =>
  request<SendOtpResponse>('/phone-verification/send', { method: 'POST', body: { phone } });

export const checkPhoneVerification = (request: AuthRequest, phone: string, code: string) =>
  request<PhoneVerificationCheckResponse>('/phone-verification/check', { method: 'POST', body: { phone, code } });

export const repayLoan = (request: AuthRequest, loanId: string) =>
  request<LoanResponse>(`/loans/${encodeURIComponent(loanId)}/repay`, { method: 'PATCH' });
