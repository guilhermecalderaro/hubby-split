import { useEffect, useState } from 'react'
import { Group } from '../types'

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/splitwise/groups')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setGroups(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { groups, loading, error }
}
