# MiniLedger

A mobile app for tracking money you lend to friends: who owes you, how much, when it is due,
and what has been paid back. Built for a Full Stack Development internship assignment.

- **Phone-number login** with a one-time code (mock SMS: the code is printed in the API log).
- **Loans**: add (with a calendar date picker), list (search by name, sort by recent or due date,
  filter by Pending / Repaid / Overdue), view details, mark as repaid.
- **Dashboard**: Total Lent, Total Repaid, Outstanding, Overdue Amount, Active Loans, recent loans,
  with overdue loans highlighted in red.

| Workspace  | Stack                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| `backend/` | Node.js 22, Express 5, TypeScript, PostgreSQL, Prisma ORM 7, Zod, jose (JWT) |
| `mobile/`  | React Native 0.88, Expo SDK 58, Expo Router, TypeScript                |
| `e2e/`     | Browser end-to-end test (puppeteer-core + your installed Chrome)       |

The app talks only to the REST API; it never connects to PostgreSQL directly.

## Screenshots

Captured from the real app (Expo web build, 412 × 915) during the end-to-end test run.

| Login | Empty dashboard | Overdue loan | After repayment |
| --- | --- | --- | --- |
| ![Login](docs/screenshots/login.png) | ![Empty](docs/screenshots/dashboard-empty.png) | ![Overdue](docs/screenshots/dashboard-overdue.png) | ![Repaid](docs/screenshots/dashboard-after-repay.png) |

| Add loan | Loans list | Loan details | Settings |
| --- | --- | --- | --- |
| ![Add loan](docs/screenshots/add-loan-overdue.png) | ![Loans](docs/screenshots/loans-tab.png) | ![Details](docs/screenshots/loan-details.png) | ![Settings](docs/screenshots/settings.png) |

## Project structure

```
MiniLedger/
├── package.json              npm workspaces (backend, mobile) + root scripts
├── backend/
│   ├── prisma/schema.prisma  User, Loan, OtpCode models
│   ├── prisma/migrations/    SQL migrations (incl. CHECK amount > 0)
│   ├── prisma7.config.ts     Prisma CLI config (reads DATABASE_URL)
│   ├── src/
│   │   ├── index.ts          server entry
│   │   ├── app.ts            Express app (routes, middleware)
│   │   ├── config/           env validation (Zod), auth constants
│   │   ├── routes/           auth, loans, dashboard, health
│   │   ├── services/         business logic (auth, loans/summary)
│   │   ├── middleware/       requireAuth, rate limits, error handler
│   │   └── lib/              prisma client, JWT, OTP hashing, dates, errors
│   └── tests/                node:test suites (run against a separate _test database)
├── mobile/
│   └── src/
│       ├── app/              Expo Router screens
│       │   ├── _layout.tsx   auth gate: login vs. app
│       │   ├── login.tsx
│       │   ├── (tabs)/       index (dashboard), loans, settings
│       │   └── loans/        new (add loan), [id] (details)
│       ├── api/              endpoint functions + response types
│       ├── components/       dashboard/, loans/, ui/
│       ├── context/          AuthProvider (session, token, 401 handling)
│       ├── hooks/            useFocusedQuery (load on focus, refresh, dedupe)
│       └── lib/              API client, secure session storage, formatting
├── e2e/web-journey.mjs       full user journey in headless Chrome
└── docs/screenshots/
```

## Prerequisites

- Node.js **22.12+** and npm 10+
- PostgreSQL **14+** (tested with 17)
- For the phone: **Expo Go** (Android/iOS), or an Android emulator (Android Studio)
- Google Chrome (only for the optional browser end-to-end test)

## Setup

### 1. Install dependencies (one command for both apps)

```powershell
cd MiniLedger
npm install
```

### 2. PostgreSQL

Create a role and database (skip if you use the default `postgres` user):

```sql
CREATE ROLE miniledger WITH LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE miniledger OWNER miniledger;
-- for the test suite (tables are emptied during tests):
CREATE DATABASE miniledger_test OWNER miniledger;
```

### 3. Environment variables

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item mobile\.env.example mobile\.env
```

`backend/.env`:

| Variable            | Required | Description |
| ------------------- | -------- | ----------- |
| `DATABASE_URL`      | yes      | `postgresql://USER:PASSWORD@localhost:5432/miniledger?schema=public` |
| `TEST_DATABASE_URL` | for tests| Same, database name must end in `_test` |
| `JWT_SECRET`        | yes      | ≥ 32 random characters |
| `OTP_SECRET`        | yes      | ≥ 32 random characters, different from `JWT_SECRET` |
| `JWT_EXPIRES_IN`    | no       | Token lifetime, default `7d` |
| `APP_TIMEZONE`      | no       | Defines "today" for overdue checks, default `Asia/Kolkata` |
| `PORT`              | no       | Default `4100` |
| `CORS_ORIGIN`       | no       | Comma-separated origins; empty allows all (development) |

Generate each secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`mobile/.env`: `EXPO_PUBLIC_API_URL`, the API base URL **as seen from the device**:

| Where the app runs           | `EXPO_PUBLIC_API_URL` |
| ---------------------------- | --------------------- |
| Web browser / iOS simulator  | `http://localhost:4100` |
| Android emulator             | `http://10.0.2.2:4100` |
| Physical phone (same Wi-Fi)  | `http://<PC LAN IPv4 from ipconfig>:4100` |
| Production                   | `https://<your-deployed-api>` |

`EXPO_PUBLIC_*` values are compiled into the app and are visible to anyone; never put secrets there.

### 4. Database migrations

```powershell
npm run db:generate   # generate the typed Prisma client
npm run db:migrate    # create the database if missing and apply all migrations (development)
npm run db:check      # verify the connection and tables
```

| Command | Purpose |
| --- | --- |
| `npm run db:migrate -- --name <change>` | After editing `schema.prisma`: create and apply a new migration |
| `npm run db:deploy` | Production/CI: apply existing migrations only |
| `npm run db:status` | Show applied/pending migrations |
| `npm run db:studio` | Browse data in Prisma Studio |

## Running the app

Two terminals, both from the repo root:

```powershell
npm run dev:backend   # API with auto-reload: http://localhost:4100/health
npm run dev:mobile    # Expo dev server
```

Then in the Expo terminal: press **`a`** for an Android emulator, **`w`** for the web browser,
or scan the QR code with **Expo Go** on your phone.

### Mock OTP login

1. Enter any 10-digit mobile number (the app adds `+91`; type `+` first for another country code).
2. The API terminal prints: `[OTP] +919876543210 -> 482913 (valid for 5 minutes)`.
3. Enter that code. New numbers create an account automatically.

Rules: codes expire after **5 minutes**, allow **5 attempts**, are **single-use**, and a new code
replaces the previous one. Resend: once per **60 s** and **5 per hour** per number, plus per-device
limits. The code is never returned by the API; only an HMAC hash is stored.

## API (`/api/v1`)

All errors share one shape: `{ "error": { "code": "OTP_EXPIRED", "message": "...", "details": {...} } }`.
Authenticated routes need `Authorization: Bearer <token>`.

| Method & path | Auth | Request | Response |
| --- | --- | --- | --- |
| `POST /auth/send-otp` | – | `{ phone }` | `{ message, phone, expiresInSeconds, resendAvailableInSeconds }` |
| `POST /auth/verify-otp` | – | `{ phone, code }` | `{ token, tokenType, expiresAt, isNewUser, user }` |
| `GET /auth/me` | ✓ | – | `{ user }` |
| `POST /loans` | ✓ | `{ friendName, amount: "1500.50", dueDate: "YYYY-MM-DD" }` | `201 { loan }` |
| `GET /loans` | ✓ | `?status=PENDING\|REPAID\|OVERDUE&q=<name>&sort=recent\|dueDate&limit=20&cursor=<id>` | `{ loans, nextCursor, asOf }` |
| `GET /loans/:id` | ✓ | – | `{ loan }` (404 if not yours) |
| `PATCH /loans/:id/repay` | ✓ | – | `{ loan }` (409 if already repaid) |
| `GET /dashboard/summary` | ✓ | – | `{ summary }` |

A **loan** is `{ id, friendName, amount, dueDate, status, isOverdue, daysOverdue, createdAt, updatedAt }`.
Amounts are decimal strings with 2 places (stored as `DECIMAL(12,2)`, never floats).

**Summary definitions** (all computed in PostgreSQL from the current user's loans only):

| Field | Definition |
| --- | --- |
| `totalLent` | sum of all loans |
| `totalRepaid` | sum of `REPAID` loans |
| `outstanding` | sum of `PENDING` loans |
| `overdueAmount` | sum of `PENDING` loans with `dueDate` **before today** |
| `activeLoans` | count of `PENDING` loans |

**Date rules:** due dates are calendar dates. "Today" is the current date in `APP_TIMEZONE`
(default Asia/Kolkata). A loan due *today* is not overdue yet; a `REPAID` loan is never overdue.
The server computes `isOverdue`/`daysOverdue`; the app only displays them.

Example (PowerShell):

```powershell
$api = "http://localhost:4100/api/v1"
Invoke-RestMethod -Method Post "$api/auth/send-otp" -ContentType "application/json" -Body '{"phone":"+919876543210"}'
$res = Invoke-RestMethod -Method Post "$api/auth/verify-otp" -ContentType "application/json" -Body '{"phone":"+919876543210","code":"<code from API log>"}'
$h = @{ Authorization = "Bearer $($res.token)" }
Invoke-RestMethod -Method Post "$api/loans" -Headers $h -ContentType "application/json" -Body '{"friendName":"Rahul","amount":"1500","dueDate":"2026-10-01"}'
Invoke-RestMethod "$api/dashboard/summary" -Headers $h
```

## Testing

```powershell
npm run typecheck                    # TypeScript: backend (src + tests) and mobile
npm test --workspace backend         # 22 API tests against TEST_DATABASE_URL (auto-created + migrated)
npm run lint --workspace mobile      # ESLint (Expo config)
cd mobile; npx expo-doctor           # Expo dependency/config diagnostics
```

Backend tests cover: OTP send/verify, hashing, expiry, single use, attempt lockout under parallel
guessing, resend cooldown and hourly cap, per-IP limit, missing/malformed/tampered/orphaned JWTs,
loan validation, listing/pagination/filters/search/sort, loan details, cross-user isolation, repayment,
repeated and concurrent repayment, summary and overdue calculations, UTC timestamp storage.

### End-to-end browser test

Runs the full journey (login → empty dashboard → add overdue loan → second loan → validation →
calendar picker → Loans tab filters, search and sort → mark repaid → totals refresh → details → session restore → sign out →
invalid token → resend cooldown → re-login) against the real API, and fails on any console error.

```powershell
# terminal 1: API against the test database, output captured to a file (the test reads OTPs from it)
cd backend
$env:DATABASE_URL = "<your TEST_DATABASE_URL>"
cmd /c "npx tsx src/index.ts > ..\e2e\api.log 2>&1"
# terminal 2: Expo web on port 8090
cd mobile; npx expo start --port 8090
# terminal 3: the test (Chrome must be installed; set CHROME_PATH if it is elsewhere)
cd e2e; npm install
$env:API_LOG = "api.log"; $env:TEST_DATABASE_URL = "<your TEST_DATABASE_URL>"; npm test
```

The test empties nothing itself; run it against a fresh test database (for example
`TRUNCATE loans, users, otp_codes CASCADE;` in `miniledger_test`) so the first screen is the empty state.

Screenshots are written to `e2e/screenshots/`.

## Demo script (≈ 2–3 minutes)

1. **Login (30 s)**: start both apps, enter a number, show the `[OTP]` line in the API terminal,
   enter the code → empty dashboard "Your ledger starts here".
2. **Add an overdue loan (30 s)**: *Add Your First Loan* → "Rahul", ₹1,25,000, a due date 3 days ago
   (form warns it will be overdue) → dashboard shows Total Lent ₹1,25,000 and a red **OVERDUE** card,
   "Overdue by 3 days".
3. **Add a normal loan (20 s)**: *Add New Loan* → "Asha", ₹1,500.50, chip *1 week* → totals update.
4. **Repay (30 s)**: *Loans* tab → *Overdue* filter → *Mark as repaid* → confirm → card turns REPAID.
5. **Updated summary (20 s)**: *Home* → Total Repaid ₹1,25,000, Overdue ₹0 "Nothing overdue",
   pull down to refresh.
6. **Details & security (20 s)**: tap a loan for details; *Settings* → *Sign out* returns to login.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Logs mention `src/app/index.tsx` / `explore.tsx`, or old demo screens appear | You are running a different project (e.g. the original `my-expo-app` template). MiniLedger has `src/app/(tabs)/index.tsx` and no `explore.tsx`. Stop that server and run `npm run dev:mobile` from this repo. |
| `Requiring unknown module "…"`, `fetchThenEvalJs` errors on web | A browser tab holding a bundle from an older/different dev server. Close the tab, restart with `npx expo start --clear`, hard-reload (Ctrl+Shift+R). MiniLedger uses `web.output: "single"`, so there is no server rendering step to go stale. |
| "Hydration failed" on web | Not expected with `web.output: "single"`. If you switch to `"server"`, avoid nesting `Pressable`s (a `<button>` inside a `<button>` breaks hydration). |
| App says "Can't reach the MiniLedger server" | API not running, or wrong `EXPO_PUBLIC_API_URL` for the device (see table above). Restart Expo after editing `.env`. Check `http://<url>/health` in the phone's browser. |
| Physical phone can't connect | Same Wi-Fi network; use the PC's LAN IP; allow Node.js through Windows Firewall (Private networks). |
| `EADDRINUSE` on start | Port in use; set another `PORT` in `backend/.env` and update `EXPO_PUBLIC_API_URL`. |
| `Please wait N seconds before requesting another code` | Resend cooldown (60 s) working as designed. |
| `Invalid environment configuration` on API start | A required variable in `backend/.env` is missing; the message names it. |
| Times look shifted by hours in the database | Fixed: the API forces UTC database sessions. Don't remove `TimeZone=UTC` in `src/lib/prisma.ts`. |

## Known limitations

- **No real SMS**: OTPs are printed in the API log (mock OTP, as specified).
- **Not tested on an Android device/emulator in this environment** (no Android SDK installed).
  Android was verified by building the Android bundle (`npx expo export --platform android`)
  and `expo-doctor`; the full UI journey was verified on the Expo **web** build.
- **Receipt upload** and notes (optional features) are not implemented in the API, so the app
  does not show them.
- Repayments are all-or-nothing (no partial repayments); the details screen's
  repaid/remaining figures follow from that.
- Per-IP rate limits are in memory (reset on API restart; per process).
- Light theme only.
- JWTs cannot be revoked before expiry (sign-out deletes the token on the device).

## Pushing to GitHub

Create an empty repository on GitHub first (no README/licence), then:

```powershell
cd MiniLedger
git status                     # confirm no .env files are listed
git add -A
git commit -m "MiniLedger: OTP auth, loans API, dashboard, tests"
git branch -M main
git remote add origin <YOUR_REPOSITORY_URL>
git push -u origin main
```
#   M i n i L e d g e r  
 