import { Router } from 'express'
import { querySentExpenses, querySplitwiseImports } from '../services/db'

const router = Router()

router.get('/', (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string }
  const sent = querySentExpenses(from, to)
  const imported = querySplitwiseImports(from, to)
  res.json({ sent, imported })
})

export default router
