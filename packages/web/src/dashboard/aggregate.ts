// Pure aggregation helpers for the Dashboard (no React).
import { Category, SplitwiseImportRow } from '../types'
import { MONTHS_SHORT, groupLabel, parseSplits } from '../format'

/** What each expense contributes: its full amount, or one person's owed share. */
export type Measure = { kind: 'total' } | { kind: 'person'; name: string }

/** A category selection: one (sub)category, or a parent with all its subcategories. */
export type CategoryKey = `c:${number}` | `p:${number}`

const round2 = (n: number) => Math.round(n * 100) / 100

export function valueOf(row: SplitwiseImportRow, m: Measure): number {
  if (m.kind === 'total') return row.amount
  return parseSplits(row.splits).find(s => s.name === m.name)?.owedShare ?? 0
}

/** People appearing in the splits, most frequent first. */
export function people(rows: SplitwiseImportRow[]): string[] {
  const count = new Map<string, number>()
  for (const r of rows) for (const s of parseSplits(r.splits)) {
    if (s.name) count.set(s.name, (count.get(s.name) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/** Every 'YYYY-MM' from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7))
  const endY = Number(to.slice(0, 4)), endM = Number(to.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

export function matchesCategory(row: SplitwiseImportRow, key: CategoryKey, categories: Category[]): boolean {
  const id = Number(key.slice(2))
  if (row.category_id == null) return false
  if (key.startsWith('c:')) return row.category_id === id
  if (row.category_id === id) return true
  return categories.find(c => c.id === row.category_id)?.parent_id === id
}

export function byMonth(rows: SplitwiseImportRow[], m: Measure, months: string[]) {
  const sums = new Map(months.map(ym => [ym, 0]))
  for (const r of rows) {
    const ym = r.date.slice(0, 7)
    if (sums.has(ym)) sums.set(ym, sums.get(ym)! + valueOf(r, m))
  }
  return months.map(month => ({ month, value: round2(sums.get(month)!) }))
}

/** Months laid over Jan–Dec, one key per year: [{ month: 'Jan', '2025': 120, '2026': 98 }, ...] */
export function yearOverlay(rows: SplitwiseImportRow[], m: Measure, months: string[], years: string[]) {
  const monthly = new Map(byMonth(rows, m, months).map(p => [p.month, p.value]))
  return MONTHS_SHORT.map((label, i) => {
    const point: Record<string, string | number | null> = { month: label }
    for (const y of years) {
      const ym = `${y}-${String(i + 1).padStart(2, '0')}`
      // Months outside the selected period are gaps, not zeros
      point[y] = monthly.has(ym) ? monthly.get(ym)! : null
    }
    return point
  })
}

/** Sums by a label, largest first; everything after `top` folds into "Outras". */
function ranked(entries: Map<string, number>, top: number, otherLabel: string) {
  const list = [...entries].map(([label, value]) => ({ label, value: round2(value) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
  if (list.length <= top) return list
  const rest = list.slice(top).reduce((s, e) => s + e.value, 0)
  return [...list.slice(0, top), { label: otherLabel, value: round2(rest) }]
}

function sumBy(rows: SplitwiseImportRow[], key: (r: SplitwiseImportRow) => string, value: (r: SplitwiseImportRow) => number) {
  const map = new Map<string, number>()
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + value(r))
  return map
}

export function byCategory(rows: SplitwiseImportRow[], m: Measure, categories: Category[], top = 10) {
  const label = (r: SplitwiseImportRow) =>
    categories.find(c => c.id === r.category_id)?.name ?? (r.category_name || 'Sem categoria')
  const list = ranked(sumBy(rows, label, r => valueOf(r, m)), top, 'Outras')
  // Keep the category id so a click on the ranking can select it
  return list.map(e => {
    const row = rows.find(r => label(r) === e.label)
    return { ...e, categoryId: e.label === 'Outras' ? null : row?.category_id ?? null }
  })
}

export function byGroup(rows: SplitwiseImportRow[], m: Measure, top = 10) {
  return ranked(sumBy(rows, groupLabel, r => valueOf(r, m)), top, 'Outros grupos')
}

/** Who paid out of pocket — always the full amount, whatever the measure. */
export function byPayer(rows: SplitwiseImportRow[], top = 8) {
  return ranked(sumBy(rows, r => r.payer_name || 'Desconhecido', r => r.amount), top, 'Outras pessoas')
}

// ── Average & trend ──────────────────────────────────────────────────────────

export function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** Least-squares line over the non-null points (x = position). `slope` is per position (month). */
export function linearTrend(values: (number | null)[]): { fitted: (number | null)[]; slope: number } | null {
  const pts = values.map((y, x) => [x, y] as const).filter((p): p is readonly [number, number] => p[1] != null)
  if (pts.length < 2) return null
  const n = pts.length
  const mx = pts.reduce((s, [x]) => s + x, 0) / n
  const my = pts.reduce((s, [, y]) => s + y, 0) / n
  const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0)
  if (!sxx) return null
  const slope = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx
  const first = pts[0][0], last = pts[n - 1][0]
  // Drawn only across the span that has data
  return { fitted: values.map((_, x) => x >= first && x <= last ? my + slope * (x - mx) : null), slope }
}

// ── Seasons ──────────────────────────────────────────────────────────────────
// Southern-hemisphere meteorological seasons (Brazil), by whole month.
export type Season = 'Verão' | 'Outono' | 'Inverno' | 'Primavera'
export function seasonOf(month: number): Season {
  if (month === 12 || month <= 2) return 'Verão'
  if (month <= 5) return 'Outono'
  if (month <= 8) return 'Inverno'
  return 'Primavera'
}

/** Runs of consecutive x positions in the same season: months are 1–12, one per x index. */
export function seasonBands(monthNumbers: number[]) {
  const bands: { season: Season; start: number; end: number }[] = []
  monthNumbers.forEach((m, i) => {
    const s = seasonOf(m)
    const last = bands[bands.length - 1]
    if (last && last.season === s && last.end === i - 1) last.end = i
    else bands.push({ season: s, start: i, end: i })
  })
  return bands
}

/** Category key with the largest total in the rows, by subcategory. */
export function topCategory(rows: SplitwiseImportRow[], m: Measure): CategoryKey | null {
  const sums = sumBy(rows.filter(r => r.category_id != null), r => String(r.category_id), r => valueOf(r, m))
  const best = [...sums].sort((a, b) => b[1] - a[1])[0]
  return best ? `c:${Number(best[0])}` : null
}
