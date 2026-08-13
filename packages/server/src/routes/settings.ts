import { Router } from 'express'
import { readSettings, writeSettings } from '../services/settings'

const router = Router()

router.get('/', (_req, res) => {
  const settings = readSettings()
  // Never expose secrets in GET — mask the key
  res.json({ ...settings, apiKey: settings.apiKey ? '***' : '' })
})

router.post('/', (req, res) => {
  const updated = writeSettings(req.body)
  res.json({ ok: true, activeGroupIds: updated.activeGroupIds })
})

export default router
