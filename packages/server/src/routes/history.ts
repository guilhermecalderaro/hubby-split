import { Router } from 'express'
import {
  querySentExpenses, querySplitwiseImports, countSplitwiseImportsByGroup, deleteSplitwiseImportsByGroup,
} from '../services/db'

const router = Router()

router.get('/', (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string }
  const sent = querySentExpenses(from, to)
  const imported = querySplitwiseImports(from, to)
  res.json({ sent, imported })
})

// How many synced Splitwise expenses are stored per group
router.get('/group-counts', (_req, res) => {
  res.json(countSplitwiseImportsByGroup())
})

// Removes the locally stored Splitwise expenses of one group (nothing is deleted on Splitwise)
router.delete('/group/:groupId', (req, res) => {
  const groupId = Number(req.params.groupId)
  if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'groupId inválido.' })
  res.json({ removed: deleteSplitwiseImportsByGroup(groupId) })
})

export default router
