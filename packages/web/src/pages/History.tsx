import React, { useEffect, useState } from 'react'
import { DateFilter } from '../components/DateFilter'
import { SentExpense, SplitwiseExpenseSplit, SplitwiseImportRow } from '../types'
import { useCategories } from '../hooks/useCategories'

function parseSplits(raw: string): SplitwiseExpenseSplit[] {
  try { return JSON.parse(raw) ?? [] } catch { return [] }
}

function formatSplits(splits: SplitwiseExpenseSplit[]): string {
  return splits.map(s => `${s.name} ${s.owedPercent}%`).join(' · ')
}

function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export function History() {
  const [sent, setSent] = useState<SentExpense[]>([])
  const [imported, setImported] = useState<SplitwiseImportRow[]>([])
  const [dateRange, setDateRange] = useState({ from: monthStart(), to: today() })
  const [loading, setLoading] = useState(false)

  const [syncRange, setSyncRange] = useState({ from: monthStart(), to: today() })
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string>('')

  const { categories, parents, childrenOf, syncing: syncingCats, syncCategories } = useCategories()

  function getCategoryInfo(categoryId: number | null, categoryName: string) {
    if (!categoryId) return null
    const cat = categories.find(c => c.id === categoryId)
    return { name: cat?.name ?? categoryName, icon_url: cat?.icon_url ?? '' }
  }

  function fetchHistory() {
    setLoading(true)
    const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to })
    fetch(`/api/history?${params}`)
      .then(r => r.json())
      .then(data => {
        setSent(data.sent ?? [])
        setImported(data.imported ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchHistory() }, [dateRange.from, dateRange.to])

  async function syncSplitwise() {
    setSyncing(true)
    setSyncResult('')
    try {
      const res = await fetch('/api/splitwise/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: syncRange.from, to: syncRange.to }),
      })
      const data = await res.json()
      if (data.error) {
        setSyncResult(`Erro: ${data.error}`)
      } else {
        setSyncResult(`${data.count} despesa(s) salva(s) do Splitwise.`)
        fetchHistory()
      }
    } catch {
      setSyncResult('Erro ao conectar com o servidor.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncCategories() {
    try {
      const { count } = await syncCategories()
      setSyncResult(`${count} categorias sincronizadas.`)
    } catch (e: any) {
      setSyncResult(`Erro ao sincronizar categorias: ${e.message}`)
    }
  }

  const sentTotal = sent.reduce((s, r) => s + r.amount, 0)
  const importedTotal = imported.reduce((s, r) => s + r.amount, 0)

  const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, background: '#f3f4f6' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13 }
  const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h2>Histórico</h2>

      {/* ── Buscar no Splitwise ─────────────────────────────────── */}
      <div style={{
        background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
        padding: '16px 20px', marginBottom: 24,
      }}>
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Buscar no Splitwise</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13 }}>
            De{' '}
            <input
              type="date" value={syncRange.from}
              onChange={e => setSyncRange(r => ({ ...r, from: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            até{' '}
            <input
              type="date" value={syncRange.to}
              onChange={e => setSyncRange(r => ({ ...r, to: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <button
            onClick={syncSplitwise}
            disabled={syncing}
            style={{
              background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontSize: 14, cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.7 : 1,
            }}
          >
            {syncing ? 'Buscando...' : 'Buscar despesas'}
          </button>
          <button
            onClick={handleSyncCategories}
            disabled={syncingCats}
            style={{
              background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontSize: 14, cursor: syncingCats ? 'not-allowed' : 'pointer',
              opacity: syncingCats ? 0.7 : 1,
            }}
          >
            {syncingCats ? 'Sincronizando...' : `Sincronizar categorias${categories.length > 0 ? ` (${categories.length})` : ''}`}
          </button>
          {syncResult && (
            <span style={{ fontSize: 13, color: syncResult.startsWith('Erro') ? '#dc2626' : '#16a34a' }}>
              {syncResult}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8, marginBottom: 0 }}>
          Salva as despesas do Splitwise localmente para conferência e deduplicação na importação.
        </p>
      </div>

      {/* ── Filtro de período ───────────────────────────────────── */}
      <DateFilter value={dateRange} onChange={setDateRange} />

      {loading && <p>Carregando...</p>}

      {!loading && (
        <>
          {/* ── Despesas enviadas por este app ──────────────────── */}
          <h3 style={{ marginTop: 20, marginBottom: 6, fontSize: 15 }}>
            Enviadas por este app — {sent.length} despesa(s) · R$ {sentTotal.toFixed(2)}
          </h3>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Data</th>
                  <th style={th}>Descrição</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={th}>Grupo</th>
                  <th style={th}>Pagante</th>
                  <th style={th}>Categoria</th>
                  <th style={th}>Splitwise ID</th>
                  <th style={th}>Enviado em</th>
                </tr>
              </thead>
              <tbody>
                {sent.map(r => {
                  const catInfo = getCategoryInfo(r.category_id, '')
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={td}>{r.date}</td>
                      <td style={td}>{r.description}</td>
                      <td style={{ ...td, textAlign: 'right' }}>R$ {r.amount.toFixed(2)}</td>
                      <td style={td}>{r.group_name}</td>
                      <td style={td}>{r.payer_name}</td>
                      <td style={td}>
                        {catInfo ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {catInfo.icon_url && <img src={catInfo.icon_url} width={16} height={16} alt="" style={{ flexShrink: 0 }} />}
                            <span style={{ fontSize: 12 }}>{catInfo.name}</span>
                          </span>
                        ) : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: '#6366f1', fontFamily: 'monospace' }}>{r.splitwise_id}</td>
                      <td style={{ ...td, color: '#9ca3af' }}>{new Date(r.sent_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  )
                })}
                {sent.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>Nenhuma despesa no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Despesas importadas do Splitwise ───────────────── */}
          <h3 style={{ marginBottom: 6, fontSize: 15 }}>
            Importadas do Splitwise — {imported.length} despesa(s) · R$ {importedTotal.toFixed(2)}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Data</th>
                  <th style={th}>Descrição</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={th}>Pagante</th>
                  <th style={th}>Divisão</th>
                  <th style={th}>Categoria</th>
                  <th style={th}>ID Splitwise</th>
                  <th style={th}>Importado em</th>
                </tr>
              </thead>
              <tbody>
                {imported.map(r => {
                  const splits = parseSplits(r.splits)
                  const catInfo = getCategoryInfo(r.category_id, r.category_name)
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={td}>{r.date}</td>
                      <td style={td}>{r.description}</td>
                      <td style={{ ...td, textAlign: 'right' }}>R$ {r.amount.toFixed(2)}</td>
                      <td style={td}>{r.payer_name || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      <td style={{ ...td, fontSize: 12, color: '#64748b' }}>
                        {splits.length > 0 ? formatSplits(splits) : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={td}>
                        {catInfo ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {catInfo.icon_url && <img src={catInfo.icon_url} width={16} height={16} alt="" style={{ flexShrink: 0 }} />}
                            <span style={{ fontSize: 12 }}>{catInfo.name}</span>
                          </span>
                        ) : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: '#6366f1', fontFamily: 'monospace' }}>{r.id}</td>
                      <td style={{ ...td, color: '#9ca3af' }}>{new Date(r.imported_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  )
                })}
                {imported.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                    Nenhuma despesa importada no período. Use "Buscar despesas" acima.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
