import { Router } from 'express'
import { getGroups, createExpense, getExpenses, getCategories } from '../services/splitwiseClient'
import { readSettings } from '../services/settings'
import {
  insertSentExpense,
  upsertSplitwiseImports,
  getAllSentExpenses,
  getAllSplitwiseImports,
  upsertCategories,
  getAllCategories,
} from '../services/db'
import { ExpenseSubmit } from '../types'

const router = Router()

router.get('/groups', async (_req, res) => {
  try {
    const settings = readSettings()
    if (!settings.apiKey) return res.status(400).json({ error: 'API key não configurada.' })

    const groups = await getGroups()
    const active = settings.activeGroupIds
    const filtered = active.length > 0 ? groups.filter(g => active.includes(g.id)) : groups
    res.json(filtered)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/categories', (_req, res) => {
  try {
    res.json(getAllCategories())
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/sync-categories', async (_req, res) => {
  try {
    const categories = await getCategories()
    upsertCategories(categories)
    res.json({ count: categories.length })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/expenses', async (req, res) => {
  const expenses: ExpenseSubmit[] = req.body

  const sentAmounts = getAllSentExpenses()
  const swImports = getAllSplitwiseImports()
  const allHistory = [...sentAmounts, ...swImports]

  function isDuplicate(expense: ExpenseSubmit): boolean {
    const d = new Date(expense.date).getTime()
    return allHistory.some(h => {
      const diff = Math.abs(new Date(h.date).getTime() - d)
      return h.amount === expense.amount && diff <= 86_400_000
    })
  }

  const results = await Promise.allSettled(
    expenses.map(async (expense) => {
      if (isDuplicate(expense)) {
        throw new Error('Duplicata detectada no histórico. Remova ou envie manualmente se quiser prosseguir.')
      }

      const groups = await getGroups()
      const group = groups.find(g => g.id === expense.groupId)
      const payer = group?.members.find(m => m.id === expense.payerId)

      const splitwiseId = await createExpense(
        expense,
        group?.name ?? String(expense.groupId),
        payer ? `${payer.firstName} ${payer.lastName}` : String(expense.payerId)
      )

      insertSentExpense({
        id: expense.id,
        date: expense.date,
        description: expense.description,
        amount: expense.amount,
        group_id: expense.groupId,
        group_name: group?.name ?? String(expense.groupId),
        payer_id: expense.payerId,
        payer_name: payer ? `${payer.firstName} ${payer.lastName}` : String(expense.payerId),
        splitwise_id: splitwiseId,
        category_id: expense.categoryId ?? null,
        sent_at: new Date().toISOString(),
      })

      return { id: expense.id, splitwiseId, ok: true }
    })
  )

  res.json(results.map((r, i) => ({
    id: expenses[i].id,
    ok: r.status === 'fulfilled',
    splitwiseId: r.status === 'fulfilled' ? r.value.splitwiseId : null,
    error: r.status === 'rejected' ? r.reason?.message : null,
  })))
})

router.post('/sync', async (req, res) => {
  const { from, to } = req.body as { from?: string; to?: string }
  if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios.' })
  try {
    const expenses = await getExpenses({ dated_after: from, dated_before: to })
    const now = new Date().toISOString()
    upsertSplitwiseImports(expenses.map(e => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amount: e.amount,
      payer_name: e.payerName,
      splits: JSON.stringify(e.splits),
      category_id: e.categoryId ?? null,
      category_name: e.categoryName ?? '',
      imported_at: now,
    })))
    res.json({ count: expenses.length })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
