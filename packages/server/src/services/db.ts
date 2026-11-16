import { DatabaseSync } from 'node:sqlite'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data.sqlite')
const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    icon_url  TEXT NOT NULL DEFAULT '',
    parent_id INTEGER
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_expenses (
    id        TEXT PRIMARY KEY,
    data      TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS splitwise_imports (
    id            INTEGER PRIMARY KEY,
    date          TEXT NOT NULL,
    description   TEXT NOT NULL,
    amount        REAL NOT NULL,
    payer_name    TEXT NOT NULL DEFAULT '',
    splits        TEXT NOT NULL DEFAULT '[]',
    category_id   INTEGER,
    category_name TEXT NOT NULL DEFAULT '',
    imported_at   TEXT NOT NULL
  )
`)
try { db.exec(`ALTER TABLE splitwise_imports ADD COLUMN payer_name TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE splitwise_imports ADD COLUMN splits TEXT NOT NULL DEFAULT '[]'`) } catch {}
try { db.exec(`ALTER TABLE splitwise_imports ADD COLUMN category_id INTEGER`) } catch {}
try { db.exec(`ALTER TABLE splitwise_imports ADD COLUMN category_name TEXT NOT NULL DEFAULT ''`) } catch {}
// NULL group_id = synced before groups were tracked; 0 = non-group expense
try { db.exec(`ALTER TABLE splitwise_imports ADD COLUMN group_id INTEGER`) } catch {}
try { db.exec(`ALTER TABLE splitwise_imports ADD COLUMN group_name TEXT NOT NULL DEFAULT ''`) } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS sent_expenses (
    id           TEXT PRIMARY KEY,
    date         TEXT NOT NULL,
    description  TEXT NOT NULL,
    amount       REAL NOT NULL,
    group_id     INTEGER NOT NULL,
    group_name   TEXT NOT NULL,
    payer_id     INTEGER NOT NULL,
    payer_name   TEXT NOT NULL,
    splitwise_id INTEGER NOT NULL,
    category_id  INTEGER,
    sent_at      TEXT NOT NULL
  )
`)
try { db.exec(`ALTER TABLE sent_expenses ADD COLUMN category_id INTEGER`) } catch {}

// ── Categories ───────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: number
  name: string
  icon_url: string
  parent_id: number | null
}

export function upsertCategories(rows: CategoryRow[]): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO categories (id, name, icon_url, parent_id) VALUES (?, ?, ?, ?)`
  )
  for (const r of rows) {
    stmt.run(r.id, r.name, r.icon_url, r.parent_id ?? null)
  }
}

export function getAllCategories(): CategoryRow[] {
  return db.prepare(`SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name`)
    .all() as unknown as CategoryRow[]
}

// ── Splitwise imports ────────────────────────────────────────────────────────

export interface SplitwiseImportRow {
  id: number
  date: string
  description: string
  amount: number
  payer_name: string
  splits: string   // JSON: SplitwiseExpenseSplit[]
  category_id: number | null
  category_name: string
  group_id: number | null
  group_name: string
  imported_at: string
}

export function upsertSplitwiseImports(rows: SplitwiseImportRow[]): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO splitwise_imports
      (id, date, description, amount, payer_name, splits, category_id, category_name, group_id, group_name, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of rows) {
    stmt.run(r.id, r.date, r.description, r.amount, r.payer_name, r.splits,
      r.category_id ?? null, r.category_name, r.group_id ?? null, r.group_name, r.imported_at)
  }
}

// Rows stored per group (NULL group_id = synced before groups were tracked)
export function countSplitwiseImportsByGroup(): { group_id: number | null; count: number }[] {
  return db.prepare(`SELECT group_id, COUNT(*) AS count FROM splitwise_imports GROUP BY group_id`)
    .all() as unknown as { group_id: number | null; count: number }[]
}

export function deleteSplitwiseImportsByGroup(groupId: number): number {
  return Number(db.prepare(`DELETE FROM splitwise_imports WHERE group_id = ?`).run(groupId).changes)
}

export function deleteSplitwiseImports(ids: number[]): number {
  const stmt = db.prepare(`DELETE FROM splitwise_imports WHERE id = ?`)
  let removed = 0
  for (const id of ids) removed += Number(stmt.run(id).changes)
  return removed
}

export function querySplitwiseImports(from?: string, to?: string): SplitwiseImportRow[] {
  if (from && to) {
    return db.prepare(
      `SELECT * FROM splitwise_imports WHERE date >= ? AND date <= ? ORDER BY date DESC`
    ).all(from, to) as unknown as SplitwiseImportRow[]
  }
  return db.prepare(`SELECT * FROM splitwise_imports ORDER BY date DESC`).all() as unknown as SplitwiseImportRow[]
}

export function getAllSplitwiseImports(): Pick<SplitwiseImportRow, 'date' | 'amount' | 'description'>[] {
  return db.prepare(`SELECT date, amount, description FROM splitwise_imports`)
    .all() as Pick<SplitwiseImportRow, 'date' | 'amount' | 'description'>[]
}

// ── Sent expenses ────────────────────────────────────────────────────────────

export interface SentExpenseRow {
  id: string
  date: string
  description: string
  amount: number
  group_id: number
  group_name: string
  payer_id: number
  payer_name: string
  splitwise_id: number
  category_id: number | null
  sent_at: string
}

export function insertSentExpense(row: SentExpenseRow): void {
  db.prepare(`
    INSERT OR IGNORE INTO sent_expenses
      (id, date, description, amount, group_id, group_name, payer_id, payer_name, splitwise_id, category_id, sent_at)
    VALUES
      (:id, :date, :description, :amount, :group_id, :group_name, :payer_id, :payer_name, :splitwise_id, :category_id, :sent_at)
  `).run(row as unknown as Record<string, string | number | null>)
}

export function querySentExpenses(from?: string, to?: string): SentExpenseRow[] {
  if (from && to) {
    return db.prepare(
      `SELECT * FROM sent_expenses WHERE date >= ? AND date <= ? ORDER BY date DESC`
    ).all(from, to) as unknown as SentExpenseRow[]
  }
  return db.prepare(`SELECT * FROM sent_expenses ORDER BY date DESC`).all() as unknown as SentExpenseRow[]
}

export function getAllSentExpenses(): Pick<SentExpenseRow, 'date' | 'amount'>[] {
  return db.prepare(`SELECT date, amount FROM sent_expenses`).all() as Pick<SentExpenseRow, 'date' | 'amount'>[]
}

// ── Pending expenses ─────────────────────────────────────────────────────────

export function getPendingExpenses(): unknown[] {
  return (db.prepare(`SELECT data FROM pending_expenses ORDER BY rowid`).all() as { data: string }[])
    .map(r => JSON.parse(r.data))
}

export function upsertPendingExpenses(expenses: unknown[]): void {
  const stmt = db.prepare(`INSERT OR REPLACE INTO pending_expenses (id, data) VALUES (?, ?)`)
  for (const e of expenses as { id: string }[]) {
    stmt.run(e.id, JSON.stringify(e))
  }
}

export function deletePendingExpense(id: string): void {
  db.prepare(`DELETE FROM pending_expenses WHERE id = ?`).run(id)
}

export function clearPendingExpenses(): void {
  db.exec(`DELETE FROM pending_expenses`)
}


