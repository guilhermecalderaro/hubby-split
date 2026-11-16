// Pure helpers for the electricity bill charts (no React).
import { ElectricityBill } from '../types'

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export const kwhPerDay = (b: ElectricityBill) => b.days ? round(b.kwh / b.days, 1) : null

/** Energy-related cost per kWh, taxes included: (TUSD + TE + flag surcharge) / kWh. */
export const effectiveRate = (b: ElectricityBill) => b.kwh ? round((b.tusdAmount + b.teAmount + b.flagCharge) / b.kwh, 3) : null

export const COMPOSITION = [
  { key: 'energia', label: 'Energia (TUSD + TE)' },
  { key: 'bandeira', label: 'Bandeira tarifária' },
  { key: 'cip', label: 'Iluminação pública' },
  { key: 'ajustes', label: 'Ajustes, multas e outros' },
  { key: 'creditos', label: 'Créditos e devoluções' },
] as const

export function composition(b: ElectricityBill) {
  return {
    month: b.refMonth,
    energia: round(b.tusdAmount + b.teAmount),
    bandeira: b.flagCharge,
    cip: b.cip,
    ajustes: b.adjustments,
    creditos: b.credits,      // negative, stacks below zero
    total: b.total,
  }
}

export const FLAGS = [
  { key: 'verde', label: 'Verde', color: '#3fb27f' },
  { key: 'amarela', label: 'Amarela', color: '#eda100' },
  { key: 'vermelha1', label: 'Vermelha P1', color: '#e34948' },
  { key: 'vermelha2', label: 'Vermelha P2', color: '#9d1d1c' },
] as const

/** Share of billed days under each tariff flag (0–100). */
export function flagShares(b: ElectricityBill) {
  const d = b.flagDays
  const total = d.verde + d.amarela + d.vermelha1 + d.vermelha2 || 1
  return {
    month: b.refMonth,
    verde: round(d.verde / total * 100, 1), amarela: round(d.amarela / total * 100, 1),
    vermelha1: round(d.vermelha1 / total * 100, 1), vermelha2: round(d.vermelha2 / total * 100, 1),
    days: d,
  }
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** Averages over the last up-to-12 bills vs the 12 bills before them. */
export function recentVsPrevious(bills: ElectricityBill[]) {
  const sorted = [...bills].sort((a, b) => a.refMonth.localeCompare(b.refMonth))
  const recent = sorted.slice(-12)
  const previous = sorted.slice(-24, -12)
  return {
    months: recent.length,
    kwhDay: avg(recent.map(kwhPerDay)), kwhDayPrev: previous.length ? avg(previous.map(kwhPerDay)) : null,
    rate: avg(recent.map(effectiveRate)), ratePrev: previous.length ? avg(previous.map(effectiveRate)) : null,
  }
}
