import fs from 'fs'
import path from 'path'
import { Settings } from '../types'

const SETTINGS_PATH = path.join(process.cwd(), 'settings.json')

const defaults: Settings = {
  apiKey: '',
  activeGroupIds: [],
  syncExcludedGroupIds: [],
}

export function readSettings(): Settings {
  if (!fs.existsSync(SETTINGS_PATH)) return { ...defaults }
  try {
    const { apiKey, activeGroupIds, syncExcludedGroupIds } = { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) }
    return { apiKey, activeGroupIds, syncExcludedGroupIds }
  } catch {
    return { ...defaults }
  }
}

export function writeSettings(settings: Partial<Settings>): Settings {
  const current = readSettings()
  const updated = { ...current, ...settings }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2))
  return updated
}
