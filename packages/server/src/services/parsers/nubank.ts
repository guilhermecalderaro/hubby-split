import pdfParse from 'pdf-parse'
import { ParserPlugin, generateId } from './index'
import { Expense } from '../../types'

const MONTHS: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
}

// "01 JUL" → "YYYY-MM-DD"
const DATE_RE = /^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/
// Section header: pdf-parse concatenates text without spaces, so "Jane DoeR$ 1.234,56"
// Thousands separator (e.g. 1.234,56) distinguishes section totals from item amounts (e.g. 59,90)
const SECTION_RE = /^(.+?)R\$\s*(\d{1,3}(?:\.\d{3})+,\d{2})\s*$/

export interface NubankSection {
  name: string
  total: number
  expenses: Expense[]
}

function extractTxLines(text: string): { txLines: string[]; year: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const faturaMatch = text.match(/FATURA\s+\d+\s+\w+\s+(\d{4})/)
  const year = faturaMatch ? faturaMatch[1] : String(new Date().getFullYear())
  const startIdx = lines.findIndex(l => l === 'TRANSAÇÕES')
  const endIdx = lines.findIndex((l, i) => i > startIdx && /Pagamentos e Financiamentos/i.test(l))
  if (startIdx === -1) return { txLines: [], year }
  return { txLines: lines.slice(startIdx + 2, endIdx === -1 ? undefined : endIdx), year }
}

function parseExpense(txLines: string[], i: number, year: string): Expense | null {
  const dateMatch = txLines[i].match(DATE_RE)
  if (!dateMatch || i + 1 >= txLines.length) return null
  const day = dateMatch[1].padStart(2, '0')
  const month = MONTHS[dateMatch[2]]
  const date = `${year}-${month}-${day}`
  const descLine = txLines[i + 1]
  const cleaned = descLine.replace(/^[•\s\d]+/, '').trim()
  const amtMatch = cleaned.match(/R\$\s*([\d.,]+)\s*$/)
  if (!amtMatch) return null
  const description = cleaned.slice(0, cleaned.lastIndexOf('R$')).trim()
  const amount = parseFloat(amtMatch[1].replace('.', '').replace(',', '.'))
  if (amount <= 0 || !description) return null
  return { id: generateId(), date, description, amount, source: 'nubank' }
}

export const nubankParser: ParserPlugin & { parseSections(input: Buffer): Promise<NubankSection[]> } = {
  name: 'nubank',

  detect(text: string): boolean {
    return text.toLowerCase().includes('nubank') || text.includes('Nu Pagamentos')
  },

  async parse(input: Buffer): Promise<Expense[]> {
    const sections = await this.parseSections(input)
    return sections.flatMap(s => s.expenses)
  },

  async parseSections(input: Buffer): Promise<NubankSection[]> {
    const { text } = await pdfParse(input)
    const { txLines, year } = extractTxLines(text)

    const sections: NubankSection[] = []
    let current: NubankSection | null = null
    let i = 0

    while (i < txLines.length) {
      const line = txLines[i]

      if (line.match(DATE_RE)) {
        const expense = parseExpense(txLines, i, year)
        if (expense) {
          if (!current) {
            // Single-section bill with no header — create an implicit section
            current = { name: '', total: 0, expenses: [] }
            sections.push(current)
          }
          current.expenses.push(expense)
        }
        i += 2
        continue
      }

      const sectionMatch = line.match(SECTION_RE)
      if (sectionMatch && !line.startsWith('•')) {
        const name = sectionMatch[1].trim()
        const total = parseFloat(sectionMatch[2].replace('.', '').replace(',', '.'))
        current = { name, total, expenses: [] }
        sections.push(current)
        i++
        continue
      }

      i++
    }

    return sections
  },
}
