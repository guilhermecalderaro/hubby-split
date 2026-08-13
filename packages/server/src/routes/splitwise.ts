import { Router } from 'express'
import { getGroups, createExpense } from '../services/splitwiseClient'
import { readSettings } from '../services/settings'
import { insertSentExpense } from '../services/db'
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

router.post('/expenses', async (req, res) => {
  const expenses: ExpenseSubmit[] = req.body

  const results = await Promise.allSettled(
    expenses.map(async (expense) => {
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

export default router
