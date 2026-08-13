import { Router } from 'express'
import { querySentExpenses } from '../services/db'

const router = Router()

router.get('/', (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string }
  const rows = querySentExpenses(from, to)
  res.json(rows)
})

export default router
