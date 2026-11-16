import { useEffect, useState } from 'react'

interface GroupOption { id: number; name: string }
// Groups just excluded that still have synced expenses stored locally
interface StoredLeftover { id: number; name: string; count: number }

export function Settings() {
  const [form, setForm] = useState({ apiKey: '' })
  const [hasKey, setHasKey] = useState(false)
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [activeIds, setActiveIds] = useState<number[]>([])
  const [allGroups, setAllGroups] = useState<GroupOption[]>([])
  const [excludedIds, setExcludedIds] = useState<number[]>([])
  const [savedExcludedIds, setSavedExcludedIds] = useState<number[]>([])
  const [leftovers, setLeftovers] = useState<StoredLeftover[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      setActiveIds(s.activeGroupIds ?? [])
      setExcludedIds(s.syncExcludedGroupIds ?? [])
      setSavedExcludedIds(s.syncExcludedGroupIds ?? [])
      setHasKey(!!s.apiKey)
    })
  }, [])

  async function save() {
    setStatus('Salvando...')
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, activeGroupIds: activeIds, syncExcludedGroupIds: excludedIds }),
    })
    const data = await res.json()
    if (!data.ok) { setStatus('Erro ao salvar.'); return }
    if (form.apiKey.trim()) setHasKey(true)
    setForm({ apiKey: '' })

    // Newly excluded groups that already have synced data: offer to delete it
    const newlyExcluded = excludedIds.filter(id => !savedExcludedIds.includes(id))
    setSavedExcludedIds(excludedIds)
    if (newlyExcluded.length) {
      const counts: { group_id: number | null; count: number }[] = await fetch('/api/history/group-counts').then(r => r.json())
      setLeftovers(newlyExcluded
        .map(id => ({
          id,
          name: allGroups.find(g => g.id === id)?.name ?? `Grupo ${id}`,
          count: counts.find(c => c.group_id === id)?.count ?? 0,
        }))
        .filter(l => l.count > 0))
    }

    // Fetch groups with new key
    const gr = await fetch('/api/splitwise/groups').then(r => r.json())
    if (!gr.error) setGroups(gr)
    setStatus('Salvo!')
    setTimeout(() => setStatus(''), 2000)
  }

  async function loadGroups() {
    const gr = await fetch('/api/splitwise/groups').then(r => r.json())
    if (gr.error) { setStatus(gr.error); return }
    setGroups(gr)
  }

  async function loadAllGroups() {
    const gr = await fetch('/api/splitwise/all-groups').then(r => r.json())
    if (gr.error) { setStatus(gr.error); return }
    setAllGroups(gr)
  }

  async function deleteLeftover(l: StoredLeftover) {
    const res = await fetch(`/api/history/group/${l.id}`, { method: 'DELETE' }).then(r => r.json())
    if (res.error) { setStatus(res.error); return }
    setLeftovers(prev => prev.filter(x => x.id !== l.id))
    setStatus(`${res.removed} despesa(s) de "${l.name}" apagada(s) do app.`)
    setTimeout(() => setStatus(''), 4000)
  }

  function toggleGroup(id: number) {
    setActiveIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleExcluded(id: number) {
    setExcludedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const smallBtn = { fontSize: 13, padding: '4px 12px', cursor: 'pointer' }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h2>Configurações</h2>

      <section style={{ marginBottom: 24 }}>
        <h3>Splitwise API</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>
            API Key {hasKey && <span style={{ color: '#16a34a' }}>(configurada)</span>}
          </label>
          <input
            type="password"
            value={form.apiKey}
            placeholder={hasKey ? 'Deixe em branco para manter' : ''}
            onChange={e => setForm({ apiKey: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
          />
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Grupos ativos</h3>
          <button onClick={loadGroups} style={smallBtn}>Carregar grupos</button>
        </div>
        {groups.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>Salve a API key e clique em "Carregar grupos".</p>}
        {groups.map(g => (
          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={activeIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
            {g.name}
          </label>
        ))}
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Não sincronizar no Histórico</h3>
          <button onClick={loadAllGroups} style={smallBtn}>Carregar grupos</button>
        </div>
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 0 }}>
          Despesas desses grupos não são buscadas do Splitwise nem usadas para detectar duplicatas.
        </p>
        {allGroups.length === 0 && (
          <p style={{ color: '#888', fontSize: 13 }}>
            {excludedIds.length ? `${excludedIds.length} grupo(s) marcado(s). ` : ''}Clique em "Carregar grupos" para escolher.
          </p>
        )}
        {allGroups.map(g => (
          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={excludedIds.includes(g.id)} onChange={() => toggleExcluded(g.id)} />
            {g.name}
          </label>
        ))}

        {leftovers.length > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              Estes grupos já têm despesas buscadas e salvas no app. Quer apagá-las daqui?
              Nada é apagado no Splitwise.
            </p>
            {leftovers.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>{l.name} — {l.count} despesa(s)</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => deleteLeftover(l)}
                    style={{ ...smallBtn, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6 }}>
                    Apagar
                  </button>
                  <button onClick={() => setLeftovers(prev => prev.filter(x => x.id !== l.id))} style={smallBtn}>
                    Manter
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <button onClick={save}
        style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 24px', fontSize: 15, cursor: 'pointer' }}>
        Salvar
      </button>
      {status && <span style={{ marginLeft: 12, color: '#4f46e5' }}>{status}</span>}
    </div>
  )
}
