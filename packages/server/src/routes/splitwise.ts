import { Router } from 'express'
import { getGroups, createExpense, getExpenses, getCategories, getGroupNames, getCurrentUserId } from '../services/splitwiseClient'
import { readSettings } from '../services/settings'
import {
  insertSentExpense,
  upsertSplitwiseImports,
  getAllSentExpenses,
  getAllSplitwiseImports,
  deleteSplitwiseImports,
  upsertCategories,
  getAllCategories,
} from '../services/db'
import { ExpenseSubmit, NON_GROUP_ID } from '../types'

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

// Every group (unfiltered by activeGroupIds) plus the non-group pseudo-group, for the sync settings
router.get('/all-groups', async (_req, res) => {
  try {
    const names = await getGroupNames()
    const groups = [...names].filter(([id]) => id !== NON_GROUP_ID).map(([id, name]) => ({ id, name }))
    groups.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    res.json([...groups, { id: NON_GROUP_ID, name: 'Despesas sem grupo' }])
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/sync', async (req, res) => {
  const { from, to } = req.body as { from?: string; to?: string }
  if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios.' })
  try {
    // dated_after/dated_before are timestamp boundaries that drop expenses on the edge days,
    // so ask for one extra day on each side and trim locally
    const shift = (d: string, days: number) => {
      const x = new Date(`${d}T00:00:00Z`)
      x.setUTCDate(x.getUTCDate() + days)
      return x.toISOString().slice(0, 10)
    }
    const [{ expenses: fetched, removedIds }, groupNames, meId] = await Promise.all([
      getExpenses({ dated_after: shift(from, -1), dated_before: shift(to, 1) }),
      getGroupNames(),
      getCurrentUserId(),
    ])
    const excluded = new Set(readSettings().syncExcludedGroupIds)
    const inRange = fetched.filter(e => e.date >= from && e.date <= to)
    const expenses = inRange.filter(e => !excluded.has(e.groupId))
    const skipped = inRange.length - expenses.length
    const now = new Date().toISOString()

    // Non-group expenses are named after the other people involved, like Splitwise's friend view
    const groupName = (e: typeof expenses[number]) => {
      // Unknown group name (e.g. a group you left): store empty, the UI shows the group id
      if (e.groupId) return groupNames.get(e.groupId) ?? ''
      const others = e.splits.filter((_, i) => e.userIds[i] !== meId).map(s => s.name).filter(Boolean)
      return others.length ? others.join(', ') : ''
    }
    // Only expenses Splitwise reports as deleted, and payments. Rows the API no longer returns
    // at all (no permission, e.g. a group you left) are kept as they were last synced.
    const removed = deleteSplitwiseImports(removedIds)
    upsertSplitwiseImports(expenses.map(e => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amount: e.amount,
      payer_name: e.payerName,
      splits: JSON.stringify(e.splits),
      category_id: e.categoryId ?? null,
      category_name: e.categoryName ?? '',
      group_id: e.groupId,
      group_name: groupName(e),
      imported_at: now,
    })))
    res.json({ count: expenses.length, removed, skipped })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
