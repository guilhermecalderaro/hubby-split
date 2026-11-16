import { Router } from 'express'
import { readSettings, writeSettings } from '../services/settings'
import { Settings } from '../types'

const router = Router()

router.get('/', (_req, res) => {
  const settings = readSettings()
  // Never expose secrets in GET — only report whether a key is set
  res.json({
    apiKey: settings.apiKey ? '***' : '',
    activeGroupIds: settings.activeGroupIds,
    syncExcludedGroupIds: settings.syncExcludedGroupIds,
  })
})

router.post('/', (req, res) => {
  const patch: Partial<Settings> = {}
  // A blank key field means "keep the current key"
  if (typeof req.body.apiKey === 'string' && req.body.apiKey.trim()) patch.apiKey = req.body.apiKey.trim()
  if (Array.isArray(req.body.activeGroupIds)) patch.activeGroupIds = req.body.activeGroupIds.map(Number)
  if (Array.isArray(req.body.syncExcludedGroupIds)) patch.syncExcludedGroupIds = req.body.syncExcludedGroupIds.map(Number)
  const updated = writeSettings(patch)
  res.json({ ok: true, activeGroupIds: updated.activeGroupIds, syncExcludedGroupIds: updated.syncExcludedGroupIds })
})

export default router
