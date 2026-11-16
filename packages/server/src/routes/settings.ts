import { Router } from 'express'
import { readSettings, writeSettings } from '../services/settings'
import { Settings } from '../types'

const router = Router()

router.get('/', (_req, res) => {
  const settings = readSettings()
  // Never expose secrets in GET — only report whether a key is set
  res.json({ apiKey: settings.apiKey ? '***' : '', activeGroupIds: settings.activeGroupIds })
})

router.post('/', (req, res) => {
  const patch: Partial<Settings> = {}
  // A blank key field means "keep the current key"
  if (typeof req.body.apiKey === 'string' && req.body.apiKey.trim()) patch.apiKey = req.body.apiKey.trim()
  if (Array.isArray(req.body.activeGroupIds)) patch.activeGroupIds = req.body.activeGroupIds.map(Number)
  const updated = writeSettings(patch)
  res.json({ ok: true, activeGroupIds: updated.activeGroupIds })
})

export default router
