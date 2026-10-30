import { useState, useEffect } from 'react'
import { Category } from '../types'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [syncing, setSyncing] = useState(false)

  function load() {
    fetch('/api/splitwise/categories')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCategories(data) })
      .catch(() => {})
  }

  async function syncCategories(): Promise<{ count: number }> {
    setSyncing(true)
    try {
      const res = await fetch('/api/splitwise/sync-categories', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      load()
      return { count: data.count }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load() }, [])

  const parents = categories.filter(c => c.parent_id === null)
  const childrenOf = (parentId: number) => categories.filter(c => c.parent_id === parentId)

  return { categories, parents, childrenOf, syncing, syncCategories }
}
