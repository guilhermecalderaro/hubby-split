# CLAUDE.md

Project name: **Hubby Split** (package `hubby-split`). The local folder may still be called `splitwise-app`.

Local (personal-use) app that imports expenses from credit card statements / CSV exports, lets you review and split them, and sends them to Splitwise. The UI and user-facing messages are currently in Portuguese.

## Commands

- `npm run dev` (root): starts server (port 3001) and web (port 5173) together via `concurrently`.
- `npm run build` (root): `tsc` on the server + `tsc -b && vite build` on the web.
- `start.cmd`: Windows launcher for end users — installs deps on first run, starts `npm run dev` in a minimized window and opens the browser.
- Claude preview: `.claude/launch.json` defines `hubby-split-server` and `hubby-split-web`.
- No tests or linter are configured. Verification = `npm run build` + testing in the browser.

## Structure

npm workspaces monorepo:

- `packages/server` — Express + TypeScript, run with `tsx watch`.
  - `src/index.ts` mounts routes at `/api/{settings,splitwise,history,import,pending,receipts,electricity}`.
  - `src/routes/` — HTTP handlers; `src/services/` — logic (Splitwise client, DB, parsers, receipts).
  - `src/types.ts` — server types.
- `packages/web` — React 19 + Vite + react-router + TanStack Table.
  - Vite proxies `/api` → `http://localhost:3001`; the frontend always calls `fetch('/api/...')`.
  - Pages: `Import`, `Expenses`, `History`, `Dashboard`, `Settings` (`src/pages/`).
  - Shared display helpers (`money`/`brl`, `formatDate`, `formatMonth`, `MONTHS`, `groupLabel`, `parseSplits`) live in `src/format.ts`.
  - `src/types.ts` — frontend types. **Duplicated by hand** from `server/src/types.ts` (no shared package); when changing a shape, update both.
  - Styling is inline (`style={{...}}`), no CSS files or UI framework. Charts use `recharts` (Dashboard only).

## Persistence

- **Node's built-in SQLite** (`node:sqlite` / `DatabaseSync`) — that's why the server dev script uses `node --experimental-sqlite`. Don't add `better-sqlite3` or similar.
- Database at `data.sqlite` and config at `settings.json`, both resolved from `process.cwd()` (= `packages/server` when run via the workspace). Both are gitignored.
- Schema is created in `services/db.ts` with `CREATE TABLE IF NOT EXISTS`; migrations are `ALTER TABLE ... ADD COLUMN` wrapped in `try {}` (idempotent). Follow this pattern for new columns.
- Tables: `pending_expenses` (one JSON blob per expense), `sent_expenses` (sent by the app), `splitwise_imports` (synced from Splitwise), `categories`, `electricity_bills` (one JSON `ElectricityBill` per `ref_month`).
- `settings.json` stores the Splitwise API key and `activeGroupIds` — never commit it. `GET /api/settings` only returns `'***'` for the key; a blank key on `POST` keeps the current one.
- The server binds to `127.0.0.1` only (no auth); the Vite proxy targets `127.0.0.1:3001` to match.

## Main flow

1. **Import** (`/api/import/*`): Nubank statement PDF (`parsers/nubank.ts`, via `pdf-parse`, split by section/card), CSV with column mapping (`parsers/csv.ts`; first `/csv/columns`, then `/csv` with `mapping`), or manual entry.
2. **Deduplication**: same `amount` and date within ±1 day against `sent_expenses` + `splitwise_imports` + pending expenses already in the frontend. Logic is repeated in `routes/import.ts` (flags `duplicate`) and `routes/splitwise.ts` (blocks sending).
3. **Pending**: state lives in `App.tsx`; every change rewrites the whole list via `POST /api/pending`.
4. **Receipts / Brazilian invoices** (`services/receipts.ts`, `components/ReceiptPanel.tsx`): 44-digit access key; model 65 (NFC-e) is fetched automatically from the SEFAZ-RS portal; model 55 (NF-e) requires a gov.br login, so the user saves the page/XML and uploads it via `/api/receipts/file`.
5. **Per-item split** (`web/src/receiptSplit.ts`): receipt items assigned to one member become separate expenses (100% to them, id `"<id>~<userId>"`); the rest is split across the group. `sentParts` allows resending only the parts that failed.
6. **Send** (`POST /api/splitwise/expenses`): creates the expense in Splitwise (`services/splitwiseClient.ts`, API v3 with Bearer token) and records it in `sent_expenses`.
7. **History**: `/api/splitwise/sync` pulls Splitwise expenses for a date range into `splitwise_imports` (upsert by Splitwise id, with `group_id`/`group_name`; `group_id` NULL = synced before groups were tracked, 0 = non-group).
   - Splitwise's `dated_after`/`dated_before` drop edge days, so the route fetches one extra day on each side and trims locally.
   - Payments (settle-ups) and deleted expenses are never stored; if returned, their ids are deleted locally. Rows the API no longer returns at all (no permission, e.g. a group left) are **kept** as last synced — the owner wants them preserved.
   - Non-group expenses (`group_id` 0) store the other participants' names in `group_name` (relative to the API key's owner, from `get_current_user`). An unknown group name is stored empty and the UI shows `Grupo <id>`.
   - `settings.syncExcludedGroupIds` (0 = non-group) are skipped by the sync and so not used for dedup; their already-stored rows are kept unless the user deletes them (`DELETE /api/history/group/:id`, offered on the Settings page after excluding a group).
   - The History page groups synced rows by group (non-group by person) and flags those whose id matches a `sent_expenses.splitwise_id`; sent rows are listed separately only until they've been synced. Inside each list, rows get collapsible year and month header rows when they span more than one year/month (`periodBuckets`/`renderPeriod` in `History.tsx`).
   - `currency_code` is stored per row (`''` = synced before it was tracked, or no longer accessible).
8. **Dashboard** (`pages/Dashboard.tsx`, pure aggregation in `src/dashboard/aggregate.ts`): reads `GET /api/history` and aggregates client-side. Filters: period, measure (expense total or one person's `owedShare`), groups, currency (charts never mix currencies; rows without currency count as the only known one). Charts: per category (linear or years overlaid Jan–Dec, years with no spend hidden, max 8 = palette size), monthly total with average, category ranking (click selects the category), per group, who paid (always full amount). Colors: the dataviz reference categorical palette in fixed order (`dashboard/chartTheme.tsx`); month-by-month lines with season bands and the Linear / Anos sobrepostos toggle live in `components/MonthlyLineChart.tsx`.
9. **Electricity bills** (RGE only): `services/parsers/rgeBill.ts` parses bill PDFs (`pdf-parse` text; reference month, due date, amount due — or the tax-box total when masked —, reading period, kWh, TUSD/TE rates and amounts, tariff-flag surcharge and days per flag, public lighting (CIP), adjustments/fees, credits; validates items against "Total Distribuidora" and the amount due → `status ok|review`). It never extracts name, address or customer numbers. `POST /api/electricity/bills` (multipart `files`, many PDFs) upserts by reference month; `GET /api/electricity/bills?from&to`; `DELETE /api/electricity/bills/:ref`. The Dashboard's "Conta de luz" section (`dashboard/ElectricitySection.tsx`, helpers in `dashboard/electricity.ts`) has the import button and three charts: kWh/day, R$/kWh (effective = (TUSD + TE + flag) / kWh, plus TUSD and TE rates with taxes), and composition stacked bars with a tariff-flag days strip. Bill PDFs are personal data: keep them out of git (`luz/` and `*.pdf` are ignored).

## Conventions

- Dates are always `YYYY-MM-DD` strings.
- Money values are rounded with `round2` (`Math.round(n * 100) / 100`).
- Brazilian number format (`1.234,56`) is converted in the parsers.
- Route errors: `res.status(...).json({ error: '<message>' })`.
- Write docs, code comments and commit messages in English.

## Local sample files

- `Nubank_*.pdf`, `*.csv` at the root — the owner's real sample files, ignored by git (`*.pdf`, `*.csv`). They contain personal data: never commit them or send them to external services.
