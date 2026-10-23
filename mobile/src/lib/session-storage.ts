import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { User } from '@/api/types';

// The JWT is kept in the OS keystore (Keychain / Android Keystore) via expo-secure-store.
// SecureStore is unavailable on web, where localStorage is used instead (development only).

const TOKEN_KEY = 'miniledger.token';
const USER_KEY = 'miniledger.user';

const storage = {
  get: (key: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key),
  set: (key: string, value: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(key, value)) : SecureStore.setItemAsync(key, value),
  remove: (key: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(key)) : SecureStore.deleteItemAsync(key),
};

export interface StoredSession {
  token: string;
  /** Last known profile, so the app can open offline; refreshed from /auth/me on launch. */
  user: User | null;
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const [token, userJson] = await Promise.all([storage.get(TOKEN_KEY), storage.get(USER_KEY)]);
    if (!token) return null;
    return { token, user: userJson ? (JSON.parse(userJson) as User) : null };
  } catch {
    return null;
  }
}

export async function saveSession(token: string, user: User): Promise<void> {
  await Promise.all([storage.set(TOKEN_KEY, token), storage.set(USER_KEY, JSON.stringify(user))]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([storage.remove(TOKEN_KEY), storage.remove(USER_KEY)]).catch(() => undefined);
}
