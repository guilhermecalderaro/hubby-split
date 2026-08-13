import { DatabaseSync } from 'node:sqlite'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data.sqlite')
const db = new DatabaseSync(DB_PATH)

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
    sent_at      TEXT NOT NULL
  )
`)

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
  sent_at: string
}

export function insertSentExpense(row: SentExpenseRow): void {
  db.prepare(`
    INSERT OR IGNORE INTO sent_expenses
      (id, date, description, amount, group_id, group_name, payer_id, payer_name, splitwise_id, sent_at)
    VALUES
      (:id, :date, :description, :amount, :group_id, :group_name, :payer_id, :payer_name, :splitwise_id, :sent_at)
  `).run(row as unknown as Record<string, string | number>)
}

export function querySentExpenses(from?: string, to?: string): SentExpenseRow[] {
  if (from && to) {
    return db.prepare(
      `SELECT * FROM sent_expenses WHERE date >= ? AND date <= ? ORDER BY date DESC`
    ).all(from, to) as SentExpenseRow[]
  }
  return db.prepare(`SELECT * FROM sent_expenses ORDER BY date DESC`).all() as SentExpenseRow[]
}

export function getAllSentExpenses(): Pick<SentExpenseRow, 'date' | 'amount'>[] {
  return db.prepare(`SELECT date, amount FROM sent_expenses`).all() as Pick<SentExpenseRow, 'date' | 'amount'>[]
}
