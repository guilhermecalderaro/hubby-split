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
  - `src/index.ts` mounts routes at `/api/{settings,splitwise,history,import,pending,receipts}`.
  - `src/routes/` — HTTP handlers; `src/services/` — logic (Splitwise client, DB, parsers, receipts).
  - `src/types.ts` — server types.
- `packages/web` — React 19 + Vite + react-router + TanStack Table.
  - Vite proxies `/api` → `http://localhost:3001`; the frontend always calls `fetch('/api/...')`.
  - Pages: `Import`, `Expenses`, `History`, `Settings` (`src/pages/`).
  - `src/types.ts` — frontend types. **Duplicated by hand** from `server/src/types.ts` (no shared package); when changing a shape, update both.
  - Styling is inline (`style={{...}}`), no CSS files or UI framework.

## Persistence

- **Node's built-in SQLite** (`node:sqlite` / `DatabaseSync`) — that's why the server dev script uses `node --experimental-sqlite`. Don't add `better-sqlite3` or similar.
- Database at `data.sqlite` and config at `settings.json`, both resolved from `process.cwd()` (= `packages/server` when run via the workspace). Both are gitignored.
- Schema is created in `services/db.ts` with `CREATE TABLE IF NOT EXISTS`; migrations are `ALTER TABLE ... ADD COLUMN` wrapped in `try {}` (idempotent). Follow this pattern for new columns.
- Tables: `pending_expenses` (one JSON blob per expense), `sent_expenses` (sent by the app), `splitwise_imports` (synced from Splitwise), `categories`.
- `settings.json` stores the Splitwise API key and `activeGroupIds` — never commit it. `GET /api/settings` only returns `'***'` for the key; a blank key on `POST` keeps the current one.
- The server binds to `127.0.0.1` only (no auth); the Vite proxy targets `127.0.0.1:3001` to match.

## Main flow

1. **Import** (`/api/import/*`): Nubank statement PDF (`parsers/nubank.ts`, via `pdf-parse`, split by section/card), CSV with column mapping (`parsers/csv.ts`; first `/csv/columns`, then `/csv` with `mapping`), or manual entry.
2. **Deduplication**: same `amount` and date within ±1 day against `sent_expenses` + `splitwise_imports` + pending expenses already in the frontend. Logic is repeated in `routes/import.ts` (flags `duplicate`) and `routes/splitwise.ts` (blocks sending).
3. **Pending**: state lives in `App.tsx`; every change rewrites the whole list via `POST /api/pending`.
4. **Receipts / Brazilian invoices** (`services/receipts.ts`, `components/ReceiptPanel.tsx`): 44-digit access key; model 65 (NFC-e) is fetched automatically from the SEFAZ-RS portal; model 55 (NF-e) requires a gov.br login, so the user saves the page/XML and uploads it via `/api/receipts/file`.
5. **Per-item split** (`web/src/receiptSplit.ts`): receipt items assigned to one member become separate expenses (100% to them, id `"<id>~<userId>"`); the rest is split across the group. `sentParts` allows resending only the parts that failed.
6. **Send** (`POST /api/splitwise/expenses`): creates the expense in Splitwise (`services/splitwiseClient.ts`, API v3 with Bearer token) and records it in `sent_expenses`.
7. **History**: `/api/splitwise/sync` pulls Splitwise expenses for a date range into `splitwise_imports`.

## Conventions

- Dates are always `YYYY-MM-DD` strings.
- Money values are rounded with `round2` (`Math.round(n * 100) / 100`).
- Brazilian number format (`1.234,56`) is converted in the parsers.
- Route errors: `res.status(...).json({ error: '<message>' })`.
- Write docs, code comments and commit messages in English.

## Local sample files

- `Nubank_*.pdf`, `*.csv` at the root — the owner's real sample files, ignored by git (`*.pdf`, `*.csv`). They contain personal data: never commit them or send them to external services.
