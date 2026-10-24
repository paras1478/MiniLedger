import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp, type AppOptions } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export { prisma };

/** Empties all tables in the (guarded) test database. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE loans, users, otp_codes RESTART IDENTITY CASCADE');
}

/** Captures `[OTP] OTP generated for testing: <code>  (phone <phone>, …)` lines, without echoing them. */
export function captureOtps() {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  return {
    lastCode(phone: string): string {
      const line = lines.filter((l) => l.startsWith('[OTP] ') && l.includes(`(phone ${phone},`)).at(-1);
      const code = line?.match(/testing: (\d{6})/)?.[1];
      if (!code) throw new Error(`No OTP logged for ${phone}`);
      return code;
    },
    restore() {
      console.info = original;
    },
  };
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export async function startServer(options?: AppOptions) {
  const server: Server = createApp(options).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  async function call(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; rawBody?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse> {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(options.token && { authorization: `Bearer ${options.token}` }),
        ...options.headers,
      },
      body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
    return { status: res.status, headers: res.headers, body: await res.json() };
  }

  return {
    call,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Moves every OTP for `phone` 61 s into the past, to get past the resend cooldown in tests. */
export async function skipResendCooldown(phone: string) {
  await prisma.$executeRaw`UPDATE otp_codes SET created_at = created_at - interval '61 seconds' WHERE phone = ${phone}`;
}
