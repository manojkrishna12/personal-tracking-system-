# MANOJ TRACKING SYSTEM — Implementation Plan (Final)

> Status: awaiting final approval. Do not implement until approved.

## 0. Compliance with the nine corrections

| # | Correction | Where it lives in this plan |
|---|---|---|
| 1 | Empty/untracked day must never score; three habit states; Not Recorded never penalized; configurable | §9 Scoring — baseline-60 model with distinct ✓ / ✗ / Not Recorded effects; **no score or quality is computed for untracked days**; absence in the data = Not Recorded (excluded, neutral); weights/thresholds/baseline editable in Settings |
| 2 | Modal per normal habit (no inline inputs); Things Bought keeps its dedicated modal | §7 Daily flow — HabitModal (✓: Completed + details textarea + Save; ✗: Not Completed + optional reason + Save); separate PurchaseModal |
| 3 | Score preview ≠ authoritative; server always recomputes and stores | §7.3 — client preview mirror only; server recomputes, stores, and returns score/quality/breakdown; client-sent scores never trusted |
| 4 | No seeded 90 kg entry; explicit entries only; goal 85 editable | §13 Weight — entries created only by explicit measurement; goal default 85 kg, editable (84 included) |
| 5 | Strict streaks, no grace | §14 — any missing day breaks the tracking streak; a ✗ or missing day breaks a habit streak |
| 6 | Weekly Goals: configurable min/max targets, comparison, rules-based next-week focus | §4 HabitDefinition.weeklyGoal + §11 Weekly insights |
| 7 | Unique (userId, date); editable history; future dates blocked | §4, §8, §16 |
| 8 | UI direction | §2, §18 — minimal, calm, professional; light default, dark toggle; subtle green/amber/red only |
| 9 | Architecture / tech stack unchanged | §1, §2 |

**Data-layer clarification:** in `DailyRecord.habits`, **absence of an entry is the stored representation of Not Recorded** — distinct from `status: "not_completed"` (✗). The three states can never blur: `{ habitKey, status: "completed" | "not_completed", details?, reason? }` present in the array, or absent entirely.

## 1. Architecture

Single repo with npm workspaces (`server/`, `client/`) and root scripts (`dev`, `build`, `test`). The Vite dev server proxies `/api` to Express — no CORS, same-origin cookies.

```
Browser (React SPA)
   │  fetch /api/*  (httpOnly cookie)
   ▼
Express API (server/) ──▶ MongoDB (local dev; Atlas later via MONGODB_URI)
   │
   └─ services/: scoring · streaks · insights — pure functions, unit-tested
```

All analytics are computed server-side from stored data only (no AI). The client's only computation is a documented preview mirror of the scoring formula (`client/src/lib/scoringPreview.ts` mirrors `server/src/services/scoring.ts`; the server is the sole authority).

## 2. Tech stack (unchanged)

- Frontend: React 19 + Vite 7 + TypeScript, Tailwind v4, React Router 7, TanStack Query v5, Recharts, date-fns
- Backend: Node 24 + Express 5 + TypeScript (tsx for dev)
- Database: MongoDB + Mongoose 8 (local Mongo 8.2 installed; Atlas later via env var)
- Validation: Zod · Auth: bcryptjs + jsonwebtoken (httpOnly cookie)
- Hardening: helmet, express-rate-limit, cookie-parser
- Tests: vitest, supertest, mongodb-memory-server
- Tooling: npm workspaces + concurrently

## 3. Folder structure

```
manoj-tracking-system/
├── PLAN.md  README.md  .gitignore  .env.example  package.json
├── server/
│   ├── package.json  tsconfig.json  .env.example
│   └── src/
│       ├── index.ts            # bootstrap: env, DB connect, listen
│       ├── app.ts              # express app + middleware + routes
│       ├── config/             # env.ts, db.ts
│       ├── models/             # User, HabitDefinition, DailyRecord, WeightEntry, ScoringConfig
│       ├── routes/             # auth, days, habits, weight, settings, insights, export
│       ├── controllers/        # thin: parse → validate → service → respond
│       ├── middleware/         # auth, errorHandler, validate, rateLimit
│       ├── services/           # scoring (authoritative), streaks, weeklyInsights, monthlyAnalytics, yearReview
│       ├── seed/               # defaultHabits.ts, defaultScoring.ts
│       └── utils/              # dates.ts, money.ts
│   └── tests/                  # unit + integration
└── client/
    ├── package.json  vite.config.ts  index.html
    └── src/
        ├── main.tsx  App.tsx        # router + providers
        ├── api/                     # fetch client + endpoint functions
        ├── hooks/                   # TanStack Query hooks
        ├── lib/                     # date utils, formatting, scoringPreview.ts (mirror only)
        ├── context/                 # ThemeContext, AuthContext
        ├── components/
        │   ├── layout/              # AppShell, Sidebar, MobileNav, ThemeToggle
        │   ├── calendar/            # MonthCalendar, DayCell, YearHeatmap
        │   ├── daily/               # HabitModal, PurchaseModal, ScorePreview, DayNav
        │   ├── dashboard/           # SummaryCards, WeightGoalCard, StreakCard
        │   ├── analytics/           # ScoreTrendChart, HabitBars, ProgressBar, PurchaseSummary, WeeklyGoalsCard
        │   └── ui/                  # primitives (Modal, Badge, Input…)
        └── pages/                   # Dashboard, DayView, Weekly, Monthly, Year, Weight, Settings, Login/Register
```

## 4. MongoDB schema (5 collections)

**User**
```
email (unique), passwordHash, name,
settings: { weightGoalKg: 85, weekStartsOn: 1, timezone: "Asia/Kolkata", theme },
createdAt
```

**HabitDefinition** (seeded per user on registration)
```
userId, key, label, order, type: "boolean" | "purchase",
weeklyGoal: { min?: number, max?: number },   // absent = no goal
createdAt
```
Seeded keys: protein, eatOutside, junkFood, maggie, study, gym, thingsBought.
Seeded weekly goals (from the user's examples only, never invented): gym `min 5`, study `min 6`, protein `min 6`, junkFood `max 2`; others unset until set in Settings.
Unique index `(userId, key)`. Adding a category later = one inserted document.

**DailyRecord** — one per user per date; unique `(userId, date)`
```
userId, date: "YYYY-MM-DD",
habits: [{ habitKey, status: "completed" | "not_completed", details?, reason? }],
        // absence of an entry = Not Recorded (neutral, excluded from scoring)
purchases: [{ item, amount, category, necessary, notes? }],
score?, quality?, scoreBreakdown: [{ habitKey, effect }],   // absent on untracked days
createdAt, updatedAt
```

**WeightEntry**
```
userId, date, weightKg, note?, createdAt, updatedAt
```
Unique `(userId, date)`. Created only by explicit user action — never seeded.

**ScoringConfig** (one per user)
```
userId,
baseline: 60,
habits: [{ habitKey, enabled, direction: "positive" | "negative", points, cap }],
qualityThresholds: { excellent: 75, average: 50 },
updatedAt
```

## 5. API endpoints (all auth-protected except register/login)

- **Auth**: `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
- **Days**: `GET /days?month=YYYY-MM` (tracked days only: `{date, score, quality}`) · `GET /days/:date` · `PUT /days/:date` (upsert; body contains only explicitly-set habits + purchases; future dates rejected; **response returns authoritative `{score, quality, scoreBreakdown}`**) · `DELETE /days/:date`
- **Habits**: `GET /habits` · `PUT /habits` (label, order, weeklyGoal)
- **Weight**: `GET /weight?limit=30` · `PUT /weight/:date` · `DELETE /weight/:date`
- **Settings**: `GET|PUT /settings` (weight goal, timezone, week start, theme) · `GET|PUT /settings/scoring` · `POST /scores/recompute`
- **Insights**: `GET /insights/weekly?date=` · `GET /insights/monthly?month=` · `GET /insights/year?year=` · `GET /insights/streaks` (strict current + best, tracking + per-habit) · `GET /export`

## 6. Frontend pages/components

Routes: `/` dashboard (summary cards + month calendar) · `/day/:date` daily view · `/insights/weekly` · `/insights/monthly` · `/insights/year` · `/weight` · `/settings` · `/login` `/register`.

Key components: MonthCalendar, DayCell, HabitModal, PurchaseModal, ScorePreview, SummaryCards, WeightGoalCard, StreakCard, WeeklyGoalsCard, six analytics charts, YearHeatmap, Settings editors (scoring, habits+goals, weight goal, theme).

## 7. Daily tracking flow

1. Calendar → click a date → `/day/:date`; prev/next arrows for fast history editing.
2. Each habit row shows its state — **·** Not Recorded, **✓**, or **✗**. Clicking the row opens the **HabitModal**:
   - **✓ mode**: "Completed" heading, status pills (✓/✗), details textarea (e.g. "6 eggs + paneer"), Save + Cancel.
   - **✗ mode**: "Not Completed" heading, status pills, optional reason textarea (e.g. "Had chips while watching TV"), Save + Cancel.
   - Switching the pill flips modes without closing the modal.
3. **Save persists immediately** — a single `PUT /days/:date` with the full current record. No day-level save button, no drafts, no data-loss risk. The server returns the authoritative score/quality/breakdown and the UI refreshes from that response.
4. Things Bought → dedicated **PurchaseModal** (item, amount ₹, category, necessary Yes/No, notes; add/remove multiple purchases; each change persists immediately).
5. Score area: "No score yet — record at least one habit" until a score exists; then e.g. **82 / 100 — Excellent** with a small breakdown.
6. That date's weight entry is shown if it exists; otherwise "No weight recorded" (never mandatory).

## 8. Calendar behavior

Monday-first grid (date-fns). **Untracked days are plain cells — no badge, no auto-quality.** Tracked days show a subtle green/amber/red dot (never colored cell fills). Today has a ring outline. Future dates are dimmed and non-interactive; the server rejects future-date saves as a second guard. Clicking a date opens `/day/:date`; past dates remain fully editable.

## 9. Scoring algorithm (three-state, configurable)

| Habit state | Positive habit (Protein/Study/Gym) | Negative habit (Junk/EatOut/Maggie) |
|---|---|---|
| ✓ Completed | **+w** | **−w** |
| ✗ Not Completed | **−w** (recorded miss) | **+w** (recorded resistance) |
| Not Recorded | **0 — excluded entirely** | **0 — excluded entirely** |

Purchases: unnecessary → −8 each, capped at −20/day; necessary → 0.

```
score = clamp( baseline(60) + Σ contributions − purchase penalties, 0, 100 )
```

**A score is computed only if at least one habit is explicitly recorded or a purchase exists. Otherwise the day has no score and no quality — it is simply untracked.** An empty day can never appear as 100/100.

Worked examples (defaults; all tunable in Settings):
- Protein ✓, EatOutside ✗, JunkFood ✗, Maggie ✓, Study ✓, Gym ✓ → 60 +10 +10 +15 −5 +20 +20 = 130 → **100, Excellent**
- Study ✓, Gym ✓, Junk ✓, EatOut ✓, 1 unnecessary purchase → 60 +20 +20 −15 −10 −8 = **67, Average**
- Junk ✓, EatOut ✓, Maggie ✓, Gym ✗ → 60 −15 −10 −5 −20 = **10, Poor**
- Empty day → **no score, untracked**

Configurable in Settings: baseline, per-habit enabled/direction/points/cap, thresholds. `POST /scores/recompute` re-stamps all history after any change. Explicitly a personal consistency score — not medical.

## 10. Day quality

From the stored score: `score ≥ excellent(75)` → 🟢 Excellent · `≥ average(50)` → 🟡 Average · else 🔴 Poor. Thresholds configurable.

## 11. Weekly insights (with goals)

For the Monday–Sunday week of the requested date, from stored data only:
- Per habit: ✓ days / 7; junk / eat-out / maggie occurrence days.
- **Goal comparison** (from `HabitDefinition.weeklyGoal`):
  - "Gym: 4/5 days. Try to reach 5 next week."
  - "Junk Food: 3 days, above your target of 2."
  - "Protein: 6/6 days — goal met."
- Average score + week-over-week comparison when the previous week has data.
- **Next-week focus** (rule-based, no AI): the habit with the biggest shortfall vs its min-goal, or the negative habit most over its max-goal; if all goals met → "All weekly goals met." Sober phrasing, never gamified.
- Simple correlation only with ≥ 3 overlapping days: "On gym days you studied 4 of 5 days."
- Fewer than 3 tracked days → "Not enough data this week." Nothing is ever invented.

## 12. Monthly analytics & Year review

Six purposeful charts: daily score trend (line), habit consistency (bars), positive vs negative, gym/study/protein progress bars, junk/eat-out/maggie counts, purchase summary (total ₹, count, top category, unnecessary share).

Year page: total days tracked, good/average/poor counts, gym/study/protein days, junk/eat-out/maggie frequency, total purchase amount, best streaks, most consistent habit, habit needing improvement, weight progress, 365-day heatmap (untracked days render empty).

## 13. Weight tracking

- **No seeded entry** — 90 kg was illustrative only. Entries (date, weightKg, optional note) are created solely when you record a measurement; upsert by date; never mandatory for a daily record.
- Goal: default **85 kg** in Settings, editable anytime (84 kg included).
- Dashboard card: latest measured weight (or "No weight recorded yet"), goal, remaining, progress bar (from first recorded entry; "Goal reached" when current ≤ goal).
- Weight page: trend line (≥ 3 entries), editable history. No medical claims.

## 14. Streaks (strict)

- **Tracking streak**: consecutive calendar days with a saved DailyRecord. Any missing day breaks it. No today/yesterday grace.
- **Habit streak**: consecutive calendar days where the habit is explicitly ✓. A ✗ day or an unrecorded day breaks it.
- Best streaks computed from full history. UI distinguishes clearly: "Tracked every day: 12 days" vs "Study: 4 days straight".

## 15. Authentication & security

bcryptjs (cost 10); JWT (30 days) in `httpOnly, sameSite=strict, secure(prod)` cookie — no localStorage. Auth middleware on every route; all queries scoped to `req.user._id`; `passwordHash` never serialized. helmet + auth rate limiting + body size cap. Secrets via `.env` only; committed `.env.example` (`MONGODB_URI`, `JWT_SECRET`, `PORT`); root `.gitignore` blocks `node_modules/`, `.env`, `dist/`, logs.

## 16. Validation strategy

Zod on every body: real calendar dates; `status ∈ {completed, not_completed}`; details/reason ≤ 500 chars; purchase amounts ≥ 0, ≤ 2 decimals, sane cap; category enum; weight 20–300 kg; email format; password ≥ 8 chars. **Future dates rejected server-side.** Unique indexes + upsert enforce one record per user/date. Score/quality fields are never accepted from the client.

## 17. Error handling

Central middleware: ZodError → 400 + field messages; duplicate key → 409; invalid date/ObjectId → 400; else 500 generic (no stack leak). Client: 401 → clear session → login; inline quiet errors; failed saves leave the modal content intact for retry.

## 18. Testing strategy

- **Unit (vitest)**: scoring — all 9 state×habit-type combinations, Not Recorded neutrality, empty-day → no score, caps, disabled habits, baseline change, purchase penalties; streaks — strict gap breaks, best streak, habit streak break on ✗; weekly — goal messages, sparse weeks, next-week focus; date utils.
- **Integration (supertest + mongodb-memory-server)**: register → seeds (habits + goals + config); PUT day three-state round trip; duplicate prevented; future date rejected; server-authoritative score (client score ignored); recompute; weight upsert + no auto-creation; cross-user isolation.
- **Frontend (RTL)**: HabitModal open/save/cancel + ✓↔✗ switching; calendar untracked/tracked/today/future rendering; score preview mirrors server result.
- **Manual**: nightly use + `npm run seed:demo`.

## 19. Implementation phases

1. **Scaffold** — workspaces, both apps build, Tailwind, router, proxy, `.env.example`, `.gitignore`, README
2. **Backend core** — models (three-state), auth, seeds, days CRUD, scoring/quality/breakdown services, strict streaks, tests
3. **Frontend core** — auth screens, shell, dashboard cards, calendar, daily view (HabitModal, PurchaseModal, score preview)
4. **Insights** — weekly (goals + focus), monthly, year; streaks panel
5. **Weight** — dashboard card, page, trend chart, goal editing (no seeding)
6. **Settings & polish** — scoring editor (baseline/points/thresholds), habit/goal editor, theme toggle, empty states, responsive QA, demo script, docs

## 20. Decision log

- Scoring: baseline 60 + three-state contributions; a deductions-only model was rejected because a one-habit day would auto-score 100.
- Habit entry: modal per habit with immediate save (no day-level Save button) — zero data loss, score refreshes from every server response.
- Score preview: client mirrors the formula purely for display; server always recomputes and stores.
- Streaks: strict, no grace.
- Weight: explicit entries only; goal 85 editable; nothing derived from the 90 kg example.
- Stack, structure, security, phases: unchanged from the approved architecture.