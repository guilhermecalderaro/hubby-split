import * as XLSX from 'xlsx'
import { ParserPlugin, generateId } from './index'
import { normalizeAccessKey } from '../receipts'
import { Expense } from '../../types'

export interface CsvMapping { date: string; desc: string; amount: string; key?: string }
export interface CsvColumnInfo {
  headers: string[]
  sample: string[][]
  suggested: CsvMapping
}

// Simple CSV text parser — preserves raw strings, no type coercion
function parseCsvText(text: string, maxRows = Infinity): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/)
  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let inQuote = false, cell = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        cells.push(cell.trim()); cell = ''
      } else {
        cell += ch
      }
    }
    cells.push(cell.trim())
    return cells
  }

  const headers = parseRow(nonEmpty[0])
  const rows = nonEmpty.slice(1, maxRows === Infinity ? undefined : maxRows + 1).map(parseRow)
  return { headers, rows }
}

function suggestMapping(headers: string[]): CsvMapping {
  const find = (keywords: string[]) =>
    headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) ?? ''
  return {
    date: find(['data', 'date', 'emiss', 'registro']),
    desc: find(['descri', 'desc', 'title', 'nome', 'name', 'social', 'razão', 'razao', 'empresa', 'estabelec', 'emitente']),
    amount: find(['valor', 'amount', 'value', 'total', 'preço', 'preco']),
    key: findAccessKeyColumn(headers) ?? '',
  }
}

// Exportação do Nota Fiscal Gaúcha traz a "Chave de Acesso" de cada nota
function findAccessKeyColumn(headers: string[]): string | undefined {
  return headers.find(h => /chave\s*de\s*acesso/i.test(h))
    ?? headers.find(h => /chave|nf-?e|nfc-?e/i.test(h))
}

// mapping.key === '' significa "nenhuma"; ausente (cliente antigo) cai na detecção automática
function resolveKeyColumn(headers: string[], mapping: CsvMapping): string | undefined {
  if (mapping.key !== undefined) return mapping.key || undefined
  return findAccessKeyColumn(headers)
}

function normalizeDate(raw: unknown): string {
  if (raw instanceof Date) {
    // XLSX binary: extract UTC parts to avoid tz shift
    const y = raw.getUTCFullYear()
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0')
    const d = String(raw.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof raw === 'number') {
    // Excel serial date (days since Dec 30 1899)
    const ms = (Math.floor(raw) - 25569) * 86400 * 1000
    const d = new Date(ms)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const s = String(raw ?? '').trim()
  if (!s) return ''
  // DD/MM/YYYY
  const dmy4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy4) return `${dmy4[3]}-${dmy4[2].padStart(2, '0')}-${dmy4[1].padStart(2, '0')}`
  // DD/MM/YY (≥50 → 19xx, <50 → 20xx)
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (dmy2) {
    const year = parseInt(dmy2[3]) >= 50 ? `19${dmy2[3]}` : `20${dmy2[3]}`
    return `${year}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return s
}

function normalizeAmount(raw: unknown): number {
  if (typeof raw === 'number') return Math.abs(raw)
  const clean = String(raw).replace(/[^\d,.-]/g, '').replace(',', '.')
  return Math.abs(parseFloat(clean)) || 0
}

function rowsFromXlsx(input: Buffer): { headers: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(input, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
  return { headers: rows.length ? Object.keys(rows[0]) : [], rows }
}

export const csvParser: ParserPlugin & {
  getColumns(input: Buffer): Promise<CsvColumnInfo>
  parseWithMapping(input: Buffer, mapping: CsvMapping): Promise<Expense[]>
} = {
  name: 'csv',

  async getColumns(input: Buffer): Promise<CsvColumnInfo> {
    const isXlsx = input[0] === 0x50 && input[1] === 0x4B
    let headers: string[]
    let sample: string[][]

    if (isXlsx) {
      const { headers: h, rows } = rowsFromXlsx(input)
      headers = h
      sample = rows.slice(0, 5).map(r => headers.map(k => String(r[k] ?? '')))
    } else {
      const { headers: h, rows } = parseCsvText(input.toString('utf8'), 5)
      headers = h
      sample = rows
    }

    return { headers, sample, suggested: suggestMapping(headers) }
  },

  async parseWithMapping(input: Buffer, mapping: CsvMapping): Promise<Expense[]> {
    const isXlsx = input[0] === 0x50 && input[1] === 0x4B

    let records: { date: unknown; desc: unknown; amount: unknown; key?: unknown }[]

    if (isXlsx) {
      // XLSX binary: use XLSX with date parsing; dates come as Date objects
      const { headers, rows } = rowsFromXlsx(input)
      const keyCol = resolveKeyColumn(headers, mapping)
      records = rows.map(r => ({
        date: r[mapping.date], desc: r[mapping.desc], amount: r[mapping.amount],
        key: keyCol ? r[keyCol] : undefined,
      }))
    } else {
      // Plain CSV: use raw text parser to keep all values as strings.
      // This avoids XLSX locale-specific date auto-detection (e.g. "10/08/26"
      // parsed as Oct 8 instead of Aug 10 in Brazilian DD/MM/YY format).
      const { headers, rows } = parseCsvText(input.toString('utf8'))
      const di = headers.indexOf(mapping.date)
      const ri = headers.indexOf(mapping.desc)
      const ai = headers.indexOf(mapping.amount)
      const keyCol = resolveKeyColumn(headers, mapping)
      const ki = keyCol ? headers.indexOf(keyCol) : -1
      records = rows.map(r => ({ date: r[di] ?? '', desc: r[ri] ?? '', amount: r[ai] ?? '', key: ki >= 0 ? r[ki] : undefined }))
    }

    return records
      .map(({ date, desc, amount, key }) => {
        const amt = normalizeAmount(amount)
        if (!amt) return null
        const receiptKey = key ? normalizeAccessKey(String(key)) : null
        return {
          id: generateId(),
          date: normalizeDate(date),
          description: String(desc ?? '').trim(),
          amount: amt,
          source: 'csv',
          ...(receiptKey ? { receiptKey } : {}),
        } as Expense
      })
      .filter((e): e is Expense => e !== null)
  },

  async parse(input: Buffer): Promise<Expense[]> {
    const { suggested } = await this.getColumns(input)
    return this.parseWithMapping(input, suggested)
  },
}
