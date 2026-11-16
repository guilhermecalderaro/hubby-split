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

interface GroupBucket { key: string; name: string; rows: SplitwiseImportRow[]; total: number }

function groupRows(rows: SplitwiseImportRow[]): GroupBucket[] {
  const map = new Map<string, GroupBucket>()
  for (const r of rows) {
    // Non-group expenses are bucketed by the other person (stored in group_name at sync)
    const key = r.group_id == null ? 'unknown'
      : r.group_id === 0 ? `0:${r.group_name}`
      : String(r.group_id)
    const name = r.group_id == null ? 'Grupo não identificado'
      : r.group_id === 0 ? (r.group_name ? `Sem grupo · com ${r.group_name}` : 'Sem grupo')
      : r.group_name || `Grupo ${r.group_id}`
    const b = map.get(key) ?? { key, name, rows: [], total: 0 }
    b.rows.push(r)
    b.total += r.amount
    map.set(key, b)
  }
  // Real groups by name, then non-group (by person), then unknown
  const rank = (b: GroupBucket) => b.key === 'unknown' ? 2 : b.key.startsWith('0:') ? 1 : 0
  return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'))
}

interface MonthBucket<T> { key: string; label: string; rows: T[]; total: number }
interface YearBucket<T> { year: string; months: MonthBucket<T>[]; total: number; count: number }

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** Splits rows (newest first) into years and months; headers are shown only when there is more than one. */
function periodBuckets<T extends { date: string; amount: number }>(rows: T[]) {
  const years = new Map<string, YearBucket<T>>()
  for (const r of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    const year = r.date.slice(0, 4)
    const ym = r.date.slice(0, 7)
    const y = years.get(year) ?? { year, months: [], total: 0, count: 0 }
    let m = y.months.find(x => x.key === ym)
    if (!m) { m = { key: ym, label: MONTHS[Number(r.date.slice(5, 7)) - 1], rows: [], total: 0 }; y.months.push(m) }
    m.rows.push(r)
    m.total += r.amount
    y.total += r.amount
    y.count++
    years.set(year, y)
  }
  const list = [...years.values()]
  return {
    years: list,
    showYear: list.length > 1,
    showMonth: list.reduce((n, y) => n + y.months.length, 0) > 1,
  }
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

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
        setSyncResult(`${data.count} despesa(s) salva(s) do Splitwise.`
          + (data.removed ? ` ${data.removed} apagada(s) ou pagamento(s) removido(s).` : '')
          + (data.skipped ? ` ${data.skipped} ignorada(s) de grupos que não são sincronizados.` : ''))
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

  // Sent expenses already synced from Splitwise show up in the grouped list, flagged
  const sentBySplitwiseId = new Map(sent.map(s => [s.splitwise_id, s]))
  const importedIds = new Set(imported.map(r => r.id))
  const unsynced = sent.filter(s => !importedIds.has(s.splitwise_id))
  const unsyncedTotal = unsynced.reduce((s, r) => s + r.amount, 0)
  const importedTotal = imported.reduce((s, r) => s + r.amount, 0)

  const groups = groupRows(imported)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, background: '#f3f4f6' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13 }
  const tdNowrap: React.CSSProperties = { ...td, whiteSpace: 'nowrap' }

  // Table rows with collapsible year/month header rows, when the rows span more than one
  function renderPeriod<T extends { date: string; amount: number }>(
    prefix: string, rows: T[], colSpan: number, renderRow: (r: T) => React.ReactNode,
  ) {
    const { years, showYear, showMonth } = periodBuckets(rows)
    const header = (key: string, label: string, count: number, total: number, level: 'year' | 'month') => {
      const open = !collapsed.has(key)
      return (
        <tr key={key} onClick={() => toggleGroup(key)} style={{ cursor: 'pointer',
          background: level === 'year' ? '#eef2ff' : '#f8fafc' }}>
          <td colSpan={colSpan} style={{ ...td, padding: level === 'year' ? '8px 12px' : '6px 12px 6px 28px',
            fontWeight: 600, fontSize: level === 'year' ? 13 : 12, color: level === 'year' ? '#3730a3' : '#475569' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{open ? '▾' : '▸'} {label}</span>
              <span style={{ fontWeight: 400 }}>{count} despesa(s) · {brl(total)}</span>
            </span>
          </td>
        </tr>
      )
    }
    const out: React.ReactNode[] = []
    for (const y of years) {
      const yKey = `${prefix}|${y.year}`
      if (showYear) {
        out.push(header(yKey, y.year, y.count, y.total, 'year'))
        if (collapsed.has(yKey)) continue
      }
      for (const m of y.months) {
        const mKey = `${prefix}|${m.key}`
        if (showMonth) {
          out.push(header(mKey, showYear ? m.label : `${m.label} ${y.year}`, m.rows.length, m.total, 'month'))
          if (collapsed.has(mKey)) continue
        }
        out.push(...m.rows.map(renderRow))
      }
    }
    return out
  }
  const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h2>Histórico</h2>

      {/* ── Fetch from Splitwise ───────────────────────────────── */}
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

      {/* ── Date range filter ───────────────────────────────────── */}
      <DateFilter value={dateRange} onChange={setDateRange} />

      {loading && <p>Carregando...</p>}

      {!loading && (
        <>
          {/* ── Expenses on Splitwise, grouped by group ───────── */}
          <h3 style={{ marginTop: 20, marginBottom: 6, fontSize: 15 }}>
            No Splitwise — {imported.length} despesa(s) · {brl(importedTotal)}
          </h3>
          {imported.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>
              Nenhuma despesa do Splitwise no período. Use "Buscar despesas" acima.
            </p>
          )}
          {groups.map(g => {
            const open = !collapsed.has(g.key)
            return (
              <div key={g.key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                <button onClick={() => toggleGroup(g.key)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', background: '#f9fafb', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{open ? '▾' : '▸'} {g.name}</span>
                  <span style={{ color: '#4b5563' }}>{g.rows.length} despesa(s) · {brl(g.total)}</span>
                </button>
                {open && (
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
                        </tr>
                      </thead>
                      <tbody>
                        {renderPeriod(g.key, g.rows, 7, r => {
                          const splits = parseSplits(r.splits)
                          const catInfo = getCategoryInfo(r.category_id, r.category_name)
                          const sentRow = sentBySplitwiseId.get(r.id)
                          return (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={tdNowrap}>{formatDate(r.date)}</td>
                              <td style={td}>
                                {r.description}
                                {sentRow && (
                                  <span title={`Enviada em ${new Date(sentRow.sent_at).toLocaleString('pt-BR')}`}
                                    style={{ marginLeft: 8, fontSize: 11, background: '#e0e7ff', color: '#4338ca',
                                      borderRadius: 10, padding: '1px 7px', whiteSpace: 'nowrap' }}>
                                    enviada pelo app
                                  </span>
                                )}
                              </td>
                              <td style={{ ...tdNowrap, textAlign: 'right' }}>{brl(r.amount)}</td>
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
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {/* ── Sent by this app but not synced yet ─────────────── */}
          {unsynced.length > 0 && (
            <>
              <h3 style={{ marginTop: 24, marginBottom: 6, fontSize: 15 }}>
                Enviadas pelo app, ainda não buscadas — {unsynced.length} despesa(s) · {brl(unsyncedTotal)}
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                Depois de "Buscar despesas" no período, elas passam a aparecer no grupo delas acima.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Data</th>
                      <th style={th}>Descrição</th>
                      <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                      <th style={th}>Grupo</th>
                      <th style={th}>Pagante</th>
                      <th style={th}>ID Splitwise</th>
                      <th style={th}>Enviado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderPeriod('unsynced', unsynced, 7, r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={tdNowrap}>{formatDate(r.date)}</td>
                        <td style={td}>{r.description}</td>
                        <td style={{ ...tdNowrap, textAlign: 'right' }}>{brl(r.amount)}</td>
                        <td style={td}>{r.group_name}</td>
                        <td style={td}>{r.payer_name}</td>
                        <td style={{ ...td, color: '#6366f1', fontFamily: 'monospace' }}>{r.splitwise_id}</td>
                        <td style={{ ...td, color: '#9ca3af' }}>{new Date(r.sent_at).toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
