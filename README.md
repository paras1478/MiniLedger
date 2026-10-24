# MiniLedger

A mobile app for tracking money you lend to friends: who owes you, how much, when it is due,
and what has been paid back. Built for a Full Stack Development internship assignment.

- **Phone-number login** with a one-time code sent by SMS through **Twilio Verify** (in development
  without Twilio credentials, the code is printed in the API log instead).
- **Verified phone numbers**: Settings shows the verification state; a signed-in user can re-verify
  their number or move the account to a new one with an SMS code.
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

### Twilio Verify (SMS codes)

Codes are generated, sent and checked by [Twilio Verify](https://www.twilio.com/docs/verify); the API
never sees or stores them. Set these in `backend/.env` (server only, never in `mobile/.env`):

| Variable | Description |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account info (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account info. Or instead: |
| `TWILIO_API_KEY` + `TWILIO_API_SECRET` | Console → Account → API keys (`SK…`); used when both are set (recommended) |
| `TWILIO_VERIFY_SERVICE_SID` | Console → Verify → Services → your service (starts with `VA`) |
| `OTP_PROVIDER` | Optional. `console` or `twilio`. Empty: `console` in development, `twilio` in production |
| `OTP_RESEND_COOLDOWN_SECONDS` | Seconds between two codes to one number (default 60) |
| `OTP_MAX_SENDS_PER_HOUR` | Codes per number per hour (default 5) |

`TWILIO_PHONE_NUMBER` is **not** needed: Verify sends from Twilio's own senders.

On start the API logs which delivery it uses, e.g. `One-time codes: Twilio Verify (service …1a2b),
authenticated with API key`. **If it says `console mode, NO SMS is sent`, no SMS will arrive**: the
code is only printed in that terminal. `npm run dev:backend` restarts when `backend/.env` changes.

Check the whole Twilio setup without sending anything:

```powershell
npm run twilio:check --workspace backend                          # account, balance, Verify services, caller IDs
npm run twilio:check --workspace backend -- --phone +919876543210 # + recent Verify attempts / SMS status for a number
npm run twilio:check --workspace backend -- --send +919876543210  # manual test: sends ONE real code
```

Every send is logged as `[twilio] verify send VE… to +91********10: accepted (status=pending)`.
"Accepted" means Twilio took the request, **not** that the SMS was delivered; look the `VE…` SID up
in Console → Verify → Logs, or use `--phone` above, to see the delivery state.

- **console**: development only. Codes are printed as `[OTP] OTP generated for testing: 123456  (phone +91…)` and the app shows a
  "development server" hint. It is refused when `NODE_ENV=production`.
- **Not configured** (production without Twilio, or a malformed SID): only sending codes fails, with
  `503 OTP_PROVIDER_NOT_CONFIGURED`. The log names the missing variable; the rest of the API works.

**One-time Twilio setup**

1. Console → **Verify → Services → Create new**. Name it "MiniLedger" (the name appears in the SMS),
   keep **Code length 6**, enable the **SMS** channel. Copy the Service SID (`VA…`).
2. Console → **Verify → Settings → Geo permissions**: allow only the countries you serve (e.g. India).
   SMS to disabled countries fails with `PHONE_NOT_SUPPORTED`. Keep **Fraud Guard** on.
3. **Trial accounts** can only text numbers listed under **Phone Numbers → Verified Caller IDs**, and
   messages carry a trial prefix. Other numbers get `PHONE_NOT_SUPPORTED` (the API log says why).
   Upgrade the account (add billing) before real users sign up; each Verify attempt is billed.
4. Country rules: some countries regulate OTP SMS (India, for example, requires DLT registration
   for application-to-person SMS). Check Twilio's SMS guidelines for each country you enable,
   especially before using a custom sender ID or message template.
5. Codes stay valid in Twilio for 10 minutes by default; MiniLedger additionally accepts a code only
   within **5 minutes** and **5 attempts**, and Twilio caps sends per number on its side as well.

**Production hosting**: there is no deployment config in this repo. Set `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` (plus `DATABASE_URL`, `JWT_SECRET`, `OTP_SECRET`,
`NODE_ENV=production`, `CORS_ORIGIN`) as environment variables / secrets in your host's dashboard
(e.g. Render → Environment, Railway → Variables, Azure App Service → Configuration). Never commit
them. Build with `npm run build --workspace backend` (or let `npm start` do it), run migrations
with `npm run db:deploy`, start with `npm run start:backend`. Behind a reverse proxy, enable
`app.set('trust proxy', 1)` so the per-IP limits see the client address.

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

Production-style run of the API (compiles to `backend/dist` first, then starts it):

```powershell
npm run start:backend
```

### OTP login

1. Enter any 10-digit mobile number (the app adds `+91`; type `+` first for another country code).
2. In development the API terminal prints
   `[OTP] OTP generated for testing: 482913  (phone +919876543210, valid 5 min; …)`.
   With `OTP_PROVIDER=twilio` (and always in production) the code is sent by SMS instead.
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
| `GET /phone-verification/status` | ✓ | – | `{ phone, verified, verifiedAt, pending, available }` |
| `POST /phone-verification/send` | ✓ | `{ phone }` | same as `send-otp` |
| `POST /phone-verification/check` | ✓ | `{ phone, code }` | `{ message, user }` (409 `PHONE_IN_USE`) |
| `POST /loans` | ✓ | `{ friendName, amount: "1500.50", dueDate: "YYYY-MM-DD" }` | `201 { loan }` |
| `GET /loans` | ✓ | `?status=PENDING\|REPAID\|OVERDUE&q=<name>&sort=recent\|dueDate&limit=20&cursor=<id>` | `{ loans, nextCursor, asOf }` |
| `GET /loans/:id` | ✓ | – | `{ loan }` (404 if not yours) |
| `PATCH /loans/:id/repay` | ✓ | – | `{ loan }` (409 if already repaid) |
| `GET /dashboard/summary` | ✓ | – | `{ summary }` |

`send-otp` and `phone-verification/send` also return `delivery`: `"sms"` (Twilio) or `"log"` (development).
A **user** is `{ id, phone, name, phoneVerifiedAt, createdAt }`.

**Phone verification** lets the signed-in user prove a number and make it their account's number
(or re-verify the current one). Codes are bound to the requesting user and to their purpose, so a
login code cannot change a number and one user cannot redeem another user's code. Whether a number
already belongs to another account is only revealed (409) after its code is entered, so the API
cannot be used to look up who has an account. Limits: the per-number cooldown and hourly cap
(shared with login), plus 10 sends per hour and 30 checks per 15 minutes per user.

Example (PowerShell, with `$h` from the example below):

```powershell
Invoke-RestMethod -Method Post "$api/phone-verification/send" -Headers $h -ContentType "application/json" -Body '{"phone":"+919812345678"}'
Invoke-RestMethod -Method Post "$api/phone-verification/check" -Headers $h -ContentType "application/json" -Body '{"phone":"+919812345678","code":"<code from SMS>"}'
```

Twilio failures map to: `PHONE_INVALID` (400), `PHONE_NOT_SUPPORTED` (400: country blocked, trial
recipient), `OTP_SEND_LIMIT_REACHED` / `SMS_PROVIDER_BUSY` (429), `SMS_PROVIDER_ERROR` (503: wrong
credentials or service SID) and `SMS_PROVIDER_UNAVAILABLE` (503: network or Twilio outage).
Only Twilio error codes are logged, never codes, tokens or Twilio's messages (which can contain numbers).

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
npm test --workspace backend         # 36 API tests against TEST_DATABASE_URL (auto-created + migrated)
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

- **Live SMS delivery has not been tested** in this environment: the automated tests use a fake
  Twilio client, and no Verify Service SID was configured. Run one manual login with real
  credentials (see Twilio setup above) before relying on it.
- Without Twilio credentials, development OTPs are printed in the API log.
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
