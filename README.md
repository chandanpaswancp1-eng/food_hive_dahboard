# Foodhive — Operations Dashboard

A multi-brand cloud-kitchen operations & sales dashboard, backed by a Postgres
(Supabase) database and populated from **Grubtech's GrubCenter** portal
(`grubcenter.grubtech.io`) via a Playwright-driven sync.

## Stack

Next.js (App Router, TypeScript) · Prisma · Postgres (Supabase) · Playwright ·
Chart.js / react-chartjs-2 · Zod

## 1. Configure the database

This project uses Prisma against a Supabase Postgres instance.

1. In your Supabase project: **Settings → Database → Connection string**.
2. Copy the "Transaction" pooler URI (port `6543`) into `DATABASE_URL`, and the
   direct/session URI (port `5432`) into `DIRECT_URL`, in `.env.local`.
   Prisma needs the non-pooled `DIRECT_URL` to run migrations.
3. Run:

   ```bash
   npm run prisma:migrate
   ```

   This creates the star-schema tables (`Brand`, `Location`, `Channel`,
   `Order`, `OrderItem`, `Rating`, `StockoutEvent`, `SyncLog`, etc.) in your
   Supabase database. `npm run prisma:generate` regenerates the client only
   (no schema changes).

## 2. Connect to GrubCenter (two-step, since there's no API key)

GrubCenter is a normal logged-in web app, not a documented API. The sync
works by driving a real browser session and reading the JSON that the page's
own internal API calls return — not by scraping the rendered page.

**Step 1 — discover the real endpoints (run once, by hand):**

```bash
npm run playwright:install   # one-time: downloads the Chromium binary
npm run discover:grubcenter
```

A real browser window opens. Log in yourself (2FA included) and click
through your report pages — Sales/Channels, Cancellations, Prep Time,
Ratings, Delayed Orders, and wherever "86'd"/sold-out items live. Every JSON
response the page receives gets saved to `scraper/discovery-output/`, and
your session is saved to `scraper/storageState.json` so the next step can
reuse it without logging in again.

Share what gets captured — `lib/grubtech/normalize.ts`'s field-alias mapping
and `scraper/sync.ts`'s `REPORT_PAGES` list are currently seeded with
best-guess field names from an earlier prototype and only one confirmed page
path (`/realtime-reports/sales/channels`). Both need a pass once real
payloads are visible.

**Step 2 — run the real sync:**

```bash
npm run sync:once
```

Reuses the saved session, visits each page in `REPORT_PAGES`
(`scraper/sync.ts`), captures the same internal JSON, normalizes it
(`lib/grubtech/normalize.ts`), and upserts into Postgres
(`lib/grubtech/ingest.ts`). Writes a `SyncLog` row either way — check
`/api/sync/status` or the dashboard's header pill for the result.

You can also trigger a sync from the dashboard's "Refresh" button
(`/api/sync/trigger`), or import a CSV/Excel export via "Import CSV / Excel"
in the header (`/api/import/csv`) — both go through the same normalize/ingest
path.

## 3. Run the dashboard

```bash
npm run dev
```

Open http://localhost:3000. The dashboard has 6 tabs — Order Details,
Cancellations, Prep Time, Ratings, Delayed Orders, 86 Items — each backed by
its own aggregation module under `lib/grubtech/kpis/`. Filters (date range,
brand, cuisine, location, channel, payment) apply globally across tabs.

## Project layout

```
app/                       Next.js App Router pages + API routes
components/dashboard/      Header, FilterBar, TabBar, KpiStrip, ChartPanel, DataTable, DrillThroughModal
lib/
  grubtech/
    normalize.ts           raw GrubCenter payload -> validated order shape
    ingest.ts              normalized order -> Prisma upsert (dims + facts)
    kpis/                  one aggregation module per dashboard tab
  filters.ts                URL search params <-> Prisma where clauses
  types.ts                  shared frontend/backend types
prisma/schema.prisma        star-schema data model
scraper/
  discover.ts               Milestone 1: headed login + network capture
  sync.ts                   Milestone 2: headless sync using the saved session
```

## Known gaps to close together

- **`REPORT_PAGES` in `scraper/sync.ts`** only has one confirmed URL. Add the
  other five once you've found them in GrubCenter's nav.
- **`lib/grubtech/normalize.ts`** field aliases are a best guess. Once
  `discover.ts` captures real payloads, update the `ALIASES` map to match —
  nothing else needs to change.
- The **"86 Items" tab** expects a `StockoutEvent` per sold-out/unavailable
  event. If GrubCenter doesn't expose this as its own report, we'll need to
  figure out where that signal actually lives (e.g. inferred from item
  availability toggles elsewhere) once discovery is done.
