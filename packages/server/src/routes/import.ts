import { Router } from 'express'
import multer from 'multer'
import { nubankParser } from '../services/parsers/nubank'
import { csvParser, CsvMapping } from '../services/parsers/csv'
import { getAllSentExpenses } from '../services/db'
import { generateId } from '../services/parsers/index'
import { Expense } from '../types'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Deduplication: same amount AND date within ±1 day
function deduplicate(incoming: Expense[], existing: Expense[]): Expense[] {
  return incoming.map(expense => {
    const d = new Date(expense.date).getTime()
    const match = existing.find(e => {
      const diff = Math.abs(new Date(e.date).getTime() - d)
      return e.amount === expense.amount && diff <= 86_400_000
    })
    return match
      ? { ...expense, duplicate: true, duplicateOf: match.id }
      : { ...expense, duplicate: false }
  })
}

function sentToExpenses(): Expense[] {
  return getAllSentExpenses().map(r => ({
    id: `sent-${r.date}-${r.amount}`,
    date: r.date,
    description: '',
    amount: r.amount,
  }))
}

router.post('/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })

  try {
    const existing: Expense[] = [
      ...sentToExpenses(),
      ...(req.body.existing ? JSON.parse(req.body.existing) : []),
    ]

    const rawSections = await nubankParser.parseSections(req.file.buffer)
    const sections = rawSections.map(s => ({
      name: s.name,
      total: s.total,
      expenses: deduplicate(s.expenses, existing),
    }))

    res.json({ sections })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/csv/columns', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    res.json(await csvParser.getColumns(req.file.buffer))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })

  try {
    const mapping: CsvMapping | undefined = req.body.mapping ? JSON.parse(req.body.mapping) : undefined
    const expenses = mapping
      ? await csvParser.parseWithMapping(req.file.buffer, mapping)
      : await csvParser.parse(req.file.buffer)
    const existing: Expense[] = [
      ...sentToExpenses(),
      ...(req.body.existing ? JSON.parse(req.body.existing) : []),
    ]
    res.json(deduplicate(expenses, existing))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/manual', (req, res) => {
  const { date, description, amount } = req.body
  if (!date || !description || !amount) {
    return res.status(400).json({ error: 'date, description e amount são obrigatórios.' })
  }

  const expense: Expense = {
    id: generateId(),
    date,
    description,
    amount: parseFloat(amount),
    source: 'manual',
    duplicate: false,
  }

  const existing: Expense[] = sentToExpenses()
  res.json(deduplicate([expense], existing)[0])
})

export default router
