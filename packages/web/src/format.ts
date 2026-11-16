import { SplitwiseExpenseSplit } from './types'

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3))

export function money(n: number, currency = 'BRL'): string {
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' })
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

export const brl = (n: number) => money(n, 'BRL')

/** "2026-10-31" → "31/10/2026" */
export const formatDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** "2026-10" → "Out/26" */
export const formatMonth = (ym: string) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`

/** Display name of a synced row's Splitwise group (same labels everywhere). */
export function groupLabel(r: { group_id: number | null; group_name: string }): string {
  if (r.group_id == null) return 'Grupo não identificado'
  if (r.group_id === 0) return r.group_name ? `Sem grupo · com ${r.group_name}` : 'Sem grupo'
  return r.group_name || `Grupo ${r.group_id}`
}

export function parseSplits(raw: string): SplitwiseExpenseSplit[] {
  try { return JSON.parse(raw) ?? [] } catch { return [] }
}
