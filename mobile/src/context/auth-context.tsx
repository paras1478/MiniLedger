import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getMe, type AuthRequest } from '@/api/endpoints';
import type { User } from '@/api/types';
import { ApiError, apiRequest } from '@/lib/api-client';
import { clearSession, loadSession, saveSession } from '@/lib/session-storage';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Why the user was signed out (e.g. expired session), shown on the login screen. */
  notice: string | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  /** Replaces the signed-in user (e.g. after verifying a new phone number) and saves it. */
  updateUser: (user: User) => Promise<void>;
  /** Calls the API with the current token. Any 401 signs the user out. */
  authRequest: AuthRequest;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_EXPIRED = 'Your session has expired. Please log in again.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A ref keeps authRequest's identity stable, so screens don't refetch when the token changes.
  const tokenRef = useRef<string | null>(null);

  const signOut = useCallback(async (reason?: string) => {
    tokenRef.current = null;
    await clearSession();
    setUser(null);
    setNotice(reason ?? null);
    setStatus('signedOut');
  }, []);

  const signIn = useCallback(async (token: string, nextUser: User) => {
    await saveSession(token, nextUser);
    tokenRef.current = token;
    setUser(nextUser);
    setNotice(null);
    setStatus('signedIn');
  }, []);

  const updateUser = useCallback(async (nextUser: User) => {
    setUser(nextUser);
    if (tokenRef.current) await saveSession(tokenRef.current, nextUser);
  }, []);

  // Restore the saved session, then confirm it with the server in the background.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const session = await loadSession();
      if (!session) {
        setStatus('signedOut');
        return;
      }
      tokenRef.current = session.token;
      setUser(session.user);
      setStatus('signedIn');
      try {
        const { user: fresh } = await getMe(session.token, controller.signal);
        setUser(fresh);
        await saveSession(session.token, fresh);
      } catch (error) {
        // Offline is fine (screens show their own errors); a rejected token is not.
        if (error instanceof ApiError && error.isAuthError) await signOut(SESSION_EXPIRED);
      }
    })();
    return () => controller.abort();
  }, [signOut]);

  const authRequest = useCallback<AuthRequest>(
    async (path, options) => {
      const token = tokenRef.current;
      if (!token) throw new ApiError(401, 'AUTH_REQUIRED', SESSION_EXPIRED);
      try {
        return await apiRequest(path, { ...options, token });
      } catch (error) {
        // Only sign out if this token is still the active one (ignore late responses).
        if (error instanceof ApiError && error.isAuthError && tokenRef.current === token) {
          await signOut(SESSION_EXPIRED);
        }
        throw error;
      }
    },
    [signOut]
  );

  const value = useMemo(
    () => ({ status, user, notice, signIn, signOut, updateUser, authRequest }),
    [status, user, notice, signIn, signOut, updateUser, authRequest]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
