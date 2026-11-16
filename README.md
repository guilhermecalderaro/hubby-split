# Hubby Split

A small local web app that turns your credit card statements and spending exports into Splitwise expenses — in bulk, with deduplication and per-item splitting.

Instead of typing every shared purchase into Splitwise by hand, you import a statement, review the list, pick the group, payer and split for each expense, and send them all at once.

> Not affiliated with or endorsed by Splitwise. It just uses the public Splitwise API.

> **Status:** personal project, built for a Brazilian setup. The UI is in Portuguese, and some importers (Nubank PDF, receipt lookup) are Brazil-specific. The generic CSV/Excel importer works with any bank export. Contributions to make it more general are welcome.

## Features

- **Import expenses** from:
  - Nubank credit card statement PDFs (multi-cardholder statements are split into sections you can pick from)
  - Any CSV or Excel (`.xlsx`) file — you map the date, description and amount columns in the UI
  - Manual entry
- **Duplicate detection** against expenses you already sent and expenses synced from Splitwise (same amount, date within ±1 day). For each duplicate you can keep the existing one, replace it, merge both, or keep both.
- **Pending list** persisted locally, so you can import now and review later.
- **Bulk send** to Splitwise with group, payer, split percentages and category per expense.
- **Brazilian electronic receipts (NF-e / NFC-e):** attach a receipt by its 44-digit access key, see its line items, and assign items to a single member. Those items become a separate expense charged 100% to that person; the rest is split across the group.
  - NFC-e (model 65) is fetched automatically from the **SEFAZ-RS** portal (Rio Grande do Sul only).
  - NF-e (model 55) requires a gov.br login, so you save the page or XML from the portal and upload it.
- **History** of expenses sent by the app, plus a sync that pulls existing Splitwise expenses for a date range (used for deduplication).

## Requirements

- [Node.js](https://nodejs.org) **22.5 or newer** (the server uses Node's built-in `node:sqlite`)
- A Splitwise account and an API key (see below). Splitwise's API terms say access may require an active **Splitwise Pro** subscription; the app has only been tested with a Pro account.

## Setup

```bash
git clone https://github.com/guilhermecalderaro/hubby-split.git
cd hubby-split
npm install
npm run dev
```

Then open http://localhost:5173.

On Windows you can also double-click `start.cmd`: it installs dependencies on the first run, starts the app in a minimized window and opens the browser.

### Getting a Splitwise API key

1. Sign in to Splitwise and go to <https://secure.splitwise.com/apps>.
2. Click **Register your application** and fill in any name, description and homepage URL (e.g. `http://localhost:5173`).
3. On the app's page, click **Generate API key** and copy it. (The consumer key/secret are not needed.)
4. In the app, open **Configurações** (Settings), paste the key and click **Salvar** (Save).
5. Click **Carregar grupos** (Load groups) and tick the groups you want to use.

The key is a personal access token for your Splitwise account. Keep it private.

Your use of the API is governed by the [Splitwise API Terms of Use](https://dev.splitwise.com/). Among other things, they don't allow commercial use without a separate agreement with Splitwise, so use this tool for your own accounts only.

## Usage

1. **Importar (Import):** upload a statement PDF or a CSV/Excel file, or add an expense manually. Review the preview, resolve duplicates, choose default group/payer/split, and add the rows to the pending list.
2. **Despesas (Expenses):** adjust each expense (group, payer, split, category, receipt items) and send the selected ones to Splitwise.
3. **Histórico (History):** see what was sent, and sync expenses from Splitwise for a date range so future imports can detect duplicates.

## Data and privacy

Everything runs on your machine. The server listens only on `127.0.0.1` and has no authentication, so don't expose it to a network.

Local files created at runtime (all gitignored):

| File | Contents |
|---|---|
| `packages/server/settings.json` | Your Splitwise API key and selected groups |
| `packages/server/data.sqlite` | Pending, sent and synced expenses; categories |

The only external services contacted are the Splitwise API and, when you look up an NFC-e receipt, the SEFAZ-RS portal.

## Project structure

```
packages/
  server/   Express + TypeScript API (port 3001)
    src/routes/     HTTP endpoints under /api
    src/services/   Splitwise client, SQLite, parsers, receipt lookup
  web/      React + Vite frontend (port 5173, proxies /api to the server)
    src/pages/      Import, Expenses, History, Settings
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts server and web in watch mode |
| `npm run build` | Type-checks and builds both packages |

### Adding a statement parser

Parsers live in `packages/server/src/services/parsers/` and return a list of `Expense` objects (`{ id, date: 'YYYY-MM-DD', description, amount }`). See `nubank.ts` for a PDF example and `csv.ts` for the column-mapping importer.

## License

[MIT](LICENSE) © 2026 Guilherme Calderaro
