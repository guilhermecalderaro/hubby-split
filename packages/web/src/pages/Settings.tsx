import { useEffect, useState } from 'react'

export function Settings() {
  const [form, setForm] = useState({ apiKey: '', consumerKey: '', consumerSecret: '' })
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([])
  const [activeIds, setActiveIds] = useState<number[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      setActiveIds(s.activeGroupIds ?? [])
    })
  }, [])

  async function save() {
    setStatus('Salvando...')
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, activeGroupIds: activeIds }),
    })
    const data = await res.json()
    if (!data.ok) { setStatus('Erro ao salvar.'); return }

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

  function toggleGroup(id: number) {
    setActiveIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h2>Configurações</h2>

      <section style={{ marginBottom: 24 }}>
        <h3>Splitwise API</h3>
        {(['apiKey', 'consumerKey', 'consumerSecret'] as const).map(key => (
          <div key={key} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>
              {key === 'apiKey' ? 'API Key' : key === 'consumerKey' ? 'Consumer Key' : 'Consumer Secret'}
            </label>
            <input
              type="password"
              value={form[key]}
              placeholder={key === 'apiKey' ? 'Deixe em branco para manter' : ''}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            />
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Grupos ativos</h3>
          <button onClick={loadGroups} style={{ fontSize: 13, padding: '4px 12px', cursor: 'pointer' }}>
            Carregar grupos
          </button>
        </div>
        {groups.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>Salve a API key e clique em "Carregar grupos".</p>}
        {groups.map(g => (
          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={activeIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
            {g.name}
          </label>
        ))}
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
