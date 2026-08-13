import { Router } from 'express'
import {
  getPendingExpenses,
  upsertPendingExpenses,
  deletePendingExpense,
} from '../services/db'

const router = Router()

router.get('/', (_req, res) => {
  res.json(getPendingExpenses())
})

router.post('/', (req, res) => {
  const expenses = req.body
  if (!Array.isArray(expenses)) return res.status(400).json({ error: 'Expected array' })
  upsertPendingExpenses(expenses)
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  deletePendingExpense(req.params.id)
  res.json({ ok: true })
})

export default router
