# SelfTrack — Personal Self-Tracking & Finance Analytics System

A private, personal self-tracking dashboard. Every night, record how your day went — habits, purchases, and weight — and the app turns it into a daily score, weekly insights, monthly analytics and a year in review. Calm, minimal, no gamification.

**SelfTrack also tracks your money.** A double-entry-style ledger with two wallets (Cash and PhonePe) records every rupee in and out: opening balances, money received, expenses, and reconciliations — with weekly/monthly analytics, a Dad money report, food/wasteful-spending analysis, low-balance alerts and CSV export.

> **Not medical advice.** The daily score is a personal consistency/lifestyle metric, nothing more.

## Features

- **Calendar-first**: the dashboard is a monthly calendar; each tracked day shows a subtle quality dot (green/amber/red). Click a day to record or review it.
- **Fast nightly entry**: click a habit → small modal → ✓ (optional details) or ✗ (optional reason) → save. Purchases use a dedicated modal (item, ₹ amount, category, necessary, notes).
- **Three-state habits**: ✓ Completed, ✗ Not Completed, or Not Recorded. Not Recorded is neutral and never affects the score.
- **Daily score / 100**: configurable baseline (default 60), per-habit points, direction and maximum contribution; quality thresholds (🟢 ≥ 75, 🟡 ≥ 50, 🔴 below). An untracked day gets **no score**.
- **Weekly goals**: e.g. Gym min 5 days, Junk Food max 2 days — compared against actuals with a rule-based next-week focus (no AI).
- **Analytics**: weekly insights, monthly charts, year-in-review with a 365-day heatmap — all computed from your stored data.
- **Weight tracking**: record measurements only when you actually take them; configurable goal (default 85 kg) with progress and trend chart.
- **Strict streaks**: tracking streak = consecutive recorded days; habit streaks = consecutive ✓ days. No grace days.
- **Privacy**: password auth, hashed passwords, httpOnly cookie sessions, every query scoped to your account.
- **Money tracking**: an append-only transaction ledger is the single source of truth. Wallet balances are always *derived* from the ledger (never cached, nothing to drift). Transaction types: `opening_balance`, `money_received`, `expense`, `balance_adjustment`. Amounts are stored as integer paise. Expenses recorded from the daily view live **only** in the ledger (linked by date) — there is exactly one financial record per real-world expense, so nothing double counts. Editing/deleting any transaction recomputes balances and analytics immediately. Month boundaries never reset balances — money carries over.
- **Finance reports**: where-did-my-money-go, Dad money report, food report, wasteful-spending analysis, weekly/monthly money-flow summaries (opening → received → spent → adjustments → ending), low-balance warnings, and CSV export filtered to the selected period.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · Vite 8 · TypeScript · Tailwind CSS 4 · React Router 7 · TanStack Query 5 · Recharts · date-fns |
| Backend | Node.js 24 · Express 5 · TypeScript (tsx) |
| Database | MongoDB + Mongoose 8 (local Mongo in dev, Atlas later) |
| Validation | Zod |
| Auth | bcryptjs + JWT in an httpOnly cookie |
| Tests | Vitest + supertest + mongodb-memory-server (backend), Vitest + Testing Library (frontend) |

## Project structure

```
├── server/                 # Express REST API
│   ├── src/
│   │   ├── config/         # env + db connection
│   │   ├── models/         # User, HabitDefinition, DailyRecord, WeightEntry, ScoringConfig
│   │   ├── routes/         # thin route handlers (validate → service → respond)
│   │   ├── services/       # scoring (authoritative), streaks, insights
│   │   ├── middleware/     # auth, error handler, zod validation, rate limit
│   │   ├── seed/           # default habits + scoring config
│   │   └── utils/          # local-date helpers
│   └── tests/              # unit + API integration tests
├── client/                 # React SPA
│   └── src/
│       ├── pages/          # Dashboard, DayView, Weekly, Monthly, Year, Weight, Settings, Login/Register
│       ├── components/     # calendar, daily (HabitModal/PurchaseModal), dashboard, analytics, ui
│       ├── hooks/          # TanStack Query hooks
│       ├── api/            # typed fetch client + endpoints
│       └── lib/            # dates, formatting, scoringPreview (mirror only)
└── PLAN.md                 # the approved implementation plan
```

## Getting started

Prerequisites: **Node 20+** and a running **MongoDB** (`mongod` on `127.0.0.1:27017`, or change the URI below).

```bash
# 1. Install everything (npm workspaces)
npm install

# 2. Configure the server environment
cp server/.env.example server/.env
#    then edit server/.env — set JWT_SECRET to a long random string:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start both apps (API on :3001, web app on :5173)
npm run dev
```

Open **http://localhost:5173**, create your account, and you're ready. The Vite dev server proxies `/api` to Express, so no CORS setup is needed.

### Try it with demo data

```bash
npm run seed:demo
# logs in as demo@manoj.local / demo12345
```

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Start API + web app together |
| `npm run dev:server` / `npm run dev:client` | Start one side only |
| `npm run build` | Production build of the client |
| `npm run typecheck` | Type-check both workspaces |
| `npm test` | Run all tests (server + client) |
| `npm run seed:demo` | Seed 90 days of realistic demo data |

## How the daily score works

Score = clamp(**baseline (60)** + contributions, 0, 100), computed **only when at least one habit is recorded**.

| State | Positive habit (Study/Gym/Protein) | Negative habit (Junk/EatOut/Maggie) |
|---|---|---|
| ✓ | +points | −points |
| ✗ | −points (recorded miss) | +points (recorded resistance) |
| Not Recorded | 0 — excluded | 0 — excluded |

Each unnecessary purchase deducts `points` (capped). All values — baseline, per-habit points/direction/cap, quality thresholds — are editable in **Settings → Scoring**, and "Recompute all scores" re-stamps your history.

The client only *previews* the score; the server always recomputes, stores and returns the authoritative value.

## Adding a new habit

No code changes needed:

1. **Settings → Habits & weekly goals → New habit** (checklist or purchases type), optionally set min/max weekly targets.
2. It appears in the daily view and weekly counts immediately.
3. **Settings → Scoring** to set its weight (defaults to +10, capped at 10).

## Security notes

- Passwords are hashed with bcrypt (cost 10); sessions are 30-day JWTs in `httpOnly, sameSite=strict` cookies.
- Every API route requires auth and filters all queries by your user id — users cannot read each other's data.
- Secrets live only in `server/.env` (git-ignored). `.env.example` is committed with placeholders. Never commit real credentials.
- Backend hardening: helmet, rate limiting on auth endpoints, request body size cap, Zod validation everywhere, server-side future-date rejection.

## Testing

```bash
npm test
```

- **Server**: unit tests for scoring (three-state matrix, caps, empty-day behavior), streaks, and weekly/monthly/year insights; API integration tests (register/seeds, day upsert + duplicate prevention, future-date rejection, client-score rejection, weight, cross-user isolation, recompute) against an in-memory MongoDB.
- **Client**: score-preview mirror, HabitModal flow, MonthCalendar rendering.

## Deployment (Vercel + Render + MongoDB Atlas)

The intended production architecture keeps authentication cookies first-party: the Vercel frontend rewrites same-origin `/api/*` requests to the Render backend, so the browser never sees a cross-origin API and `SameSite=Lax` httpOnly cookies work unchanged.

```
Browser → https://<app>.vercel.app/api/*  --(Vercel rewrite)-->  https://<api>.onrender.com  -->  MongoDB Atlas
```

### Backend — Render Web Service

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

The app sets `trust proxy = 1` (Render's single proxy hop) so rate limiting keys on the real client IP.

Environment variables (set in the Render dashboard — never committed):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your MongoDB Atlas connection string |
| `JWT_SECRET` | long random string |
| `COOKIE_SAMESITE` | `lax` (correct for the same-origin rewrite) |
| `CLIENT_ORIGIN` | **required** — your Vercel frontend origin, e.g. `https://<app>.vercel.app`. Requests arrive at Render with a Vercel `Origin` header; without this the CSRF origin check rejects state-changing API calls (403). |

A `render.yaml` blueprint is included for one-click deploys.

### Frontend — Vercel

- Framework preset: **Vite** · **Root Directory: leave blank** (repo root — `vercel.json` at the root already sets the build command and `client/dist` output).
- Set `VITE_API_URL` **empty/unset** so the client calls same-origin `/api`.
- Do not set Root Directory to `client` — the root `vercel.json` would not be picked up.
- Edit `vercel.json` and replace `selftrack-api.onrender.com` with your Render service URL. The config includes the `/api` rewrite plus the SPA fallback for React Router.

### MongoDB Atlas

1. Create a free M0 cluster and a database user; allow Render's outbound IPs (or `0.0.0.0/0` for the free tier).
2. **Back up before any migration**: `mongodump --uri="$MONGODB_URI"`.
3. Put the connection string into `MONGODB_URI` on Render. Schema changes are additive and idempotent; run `npm run migrate:finance -w server` once if you have pre-finance purchase history.

### Verifying a deployment

- `GET /health` on the Render URL → `{"ok":true}` (plus Atlas connectivity).
- Register/login from the deployed frontend, create an expense, hard-refresh the page, log out and back in — the record must persist.
- Refresh a deep route (e.g. `/money`) — the SPA rewrite must serve the app, not a 404.
- Confirm no secrets are committed: only `*.env.example` files are in git.

## Export your data

- `GET /api/export` (authenticated) returns a full JSON backup of your account — habits, records, weight entries, scoring config and finance settings.
- **Money → Export CSV** downloads your financial transactions (Date, Type, Item, Amount, Wallet, Category, Necessity, Source, Note) — Excel/Google-Sheets compatible, filtered to the currently selected period, or all time.