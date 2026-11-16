// Parser for RGE (Rio Grande do Sul) electricity bill PDFs.
// Only billing figures are extracted — never name, address or customer/installation numbers.
import pdfParse from 'pdf-parse'
import { ElectricityBill, ElectricityBillItem, FlagDays } from '../../types'

const MONTHS: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** "1.234,56" → 1234.56 ; "2,31-" → -2.31 */
function brNumber(raw: string): number {
  const negative = raw.trim().endsWith('-')
  const n = parseFloat(raw.replace(/-$/, '').replace(/\./g, '').replace(',', '.'))
  return negative ? -n : n
}

/** "07/08/2025" → "2025-08-07" */
const isoDate = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`

const AMOUNT_LINE = /^(.+?)\s{2,}([\d.]+,\d{2}-?)\s*$/
const ENERGY_LINE = /^(Consumo Uso Sistema \[KWh\]-TUSD|Consumo - TE)\s+[A-Z]{3}\/\d{2}kWh([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/
const FLAG_LINE = /^Adicional de Bandeira (.+?)\s+[A-Z]{3}\/\d{2}kWh([\d.,]+)/
const FLAG_DAYS = /^(Verde|Amarela|Vermelha P1|Vermelha P2)\s+(\d{1,2}) Dias$/

export class NotAnRgeBill extends Error {}

export async function parseRgeBill(input: Buffer): Promise<ElectricityBill> {
  const { text } = await pdfParse(input)
  const lines = text.split('\n').map(l => l.replace(/\s+$/, ''))
  const notes: string[] = []

  // "AGO/202515/09/2025R$ 497,53" — reference month, due date, amount due (may be masked "R$ ****")
  const head = text.match(/\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(20\d{2})(\d{2}\/\d{2}\/\d{4})R\$\s*([\d.]+,\d{2}|\*+)/)
  const tusdIdx = lines.findIndex(l => ENERGY_LINE.test(l) && l.includes('TUSD'))
  if (!head || tusdIdx < 0) throw new NotAnRgeBill('Não parece uma fatura da RGE (mês de referência ou consumo não encontrado).')
  const refMonth = `${head[2]}-${MONTHS[head[1]]}`
  const dueDate = isoDate(head[3])

  // "07/08/202508/07/202530" — current reading, previous reading, billed days
  const reading = lines.map(l => l.trim().match(/^(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})(\d{1,2})$/)).find(Boolean)
  const readingTo = reading ? isoDate(reading[1]) : null
  const readingFrom = reading ? isoDate(reading[2]) : null
  const days = reading ? Number(reading[3]) : null
  if (!reading) notes.push('Período de leitura não encontrado.')

  // Charges block: from the TUSD line down to the first blank line
  const items: ElectricityBillItem[] = []
  let section: 'distributor' | 'debits' | 'credits' = 'distributor'
  let distributorTotal: number | null = null
  let kwh = 0, tusdRate = 0, tusdRateTax = 0, teRate = 0, teRateTax = 0
  let end = tusdIdx
  for (let i = tusdIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) { end = i; break }
    if (/^DÉBITOS DE OUTROS SERVIÇOS/i.test(line)) { section = 'debits'; continue }
    if (/^CRÉDITOS \/ DEVOLUÇÕES/i.test(line)) { section = 'credits'; continue }

    const energy = line.match(ENERGY_LINE)
    if (energy) {
      const isTusd = energy[1].includes('TUSD')
      kwh = brNumber(energy[2])
      if (isTusd) { tusdRate = brNumber(energy[3]); tusdRateTax = brNumber(energy[4]) }
      else { teRate = brNumber(energy[3]); teRateTax = brNumber(energy[4]) }
      items.push({ kind: isTusd ? 'tusd' : 'te', label: isTusd ? 'TUSD' : 'TE', amount: brNumber(energy[5]) })
      continue
    }
    const flag = line.match(FLAG_LINE)
    if (flag) { items.push({ kind: 'flag', label: `Bandeira ${flag[1]}`, amount: brNumber(flag[2]) }); continue }

    const amount = line.match(AMOUNT_LINE)
    if (!amount) { notes.push(`Linha não reconhecida: "${line.slice(0, 60)}"`); continue }
    const label = amount[1].trim()
    const value = brNumber(amount[2])
    if (/^Total Distribuidora/i.test(label)) { distributorTotal = value; continue }
    if (section === 'credits') items.push({ kind: 'credit', label, amount: -Math.abs(value) })
    else if (/IP-CIP|COSIP|Ilumina/i.test(label)) items.push({ kind: 'cip', label: 'Iluminação pública (CIP)', amount: value })
    else if (value < 0) items.push({ kind: 'credit', label, amount: value })
    // Distributor-section extras (e.g. "Parcela Art. 321/323") vs other third-party debits
    else items.push({ kind: section === 'distributor' ? 'adjustment' : 'other', label, amount: value })
  }

  // Amount due: header value, or the first number of the summary line after the block when masked
  let total: number | null = /\d/.test(head[4]) ? brNumber(head[4]) : null
  if (total == null) {
    const summary = lines.slice(end, end + 12).map(l => l.trim().match(/^([\d.]+,\d{2}) [\d.]+,\d{2}/)).find(Boolean)
    if (summary) { total = brNumber(summary[1]); notes.push('Valor da fatura mascarado no PDF; usado o total do quadro de tributos.') }
  }

  const sum = (kinds: ElectricityBillItem['kind'][]) => round2(items.filter(i => kinds.includes(i.kind)).reduce((s, i) => s + i.amount, 0))
  const tusdAmount = sum(['tusd']), teAmount = sum(['te'])
  const flagCharge = sum(['flag'])
  const cip = sum(['cip'])
  const adjustments = sum(['adjustment', 'other'])
  const credits = sum(['credit'])

  // Flag days: "Vermelha P1  23 Dias" — the same color can appear twice (two tariff periods)
  const flagDays: FlagDays = { verde: 0, amarela: 0, vermelha1: 0, vermelha2: 0 }
  for (const l of lines) {
    const m = l.trim().match(FLAG_DAYS)
    if (!m) continue
    const key = m[1] === 'Verde' ? 'verde' : m[1] === 'Amarela' ? 'amarela' : m[1] === 'Vermelha P1' ? 'vermelha1' : 'vermelha2'
    flagDays[key] += Number(m[2])
  }

  // Validation
  const distributorItems = round2(tusdAmount + teAmount + flagCharge + sum(['adjustment']))
  if (distributorTotal == null) notes.push('"Total Distribuidora" não encontrado.')
  else if (Math.abs(distributorItems - distributorTotal) > 0.05) {
    notes.push(`Itens da distribuidora (${distributorItems.toFixed(2)}) diferem do total (${distributorTotal.toFixed(2)}).`)
  }
  const computedTotal = round2((distributorTotal ?? distributorItems) + cip + sum(['other']) + credits)
  if (total == null) { total = computedTotal; notes.push('Valor da fatura não encontrado; usado o total calculado.') }
  else if (Math.abs(computedTotal - Math.max(total, 0)) > 0.05 && !(total === 0 && computedTotal < 0)) {
    notes.push(`Total calculado (${computedTotal.toFixed(2)}) difere do valor da fatura (${total.toFixed(2)}).`)
  }
  if (/Conta quitada/i.test(text)) notes.push('Conta quitada com crédito.')
  const reviewNotes = notes.filter(n => !/^Conta quitada|mascarado/.test(n))

  return {
    refMonth, dueDate, readingFrom, readingTo, days, kwh,
    total, distributorTotal: distributorTotal ?? distributorItems,
    tusdAmount, teAmount, flagCharge, cip, adjustments, credits,
    tusdRate, tusdRateTax, teRate, teRateTax, flagDays, items,
    status: reviewNotes.length ? 'review' : 'ok', notes,
  }
}
