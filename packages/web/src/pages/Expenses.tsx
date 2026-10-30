import React, { useEffect, useState } from 'react'
import { Expense, SendResult, SentExpense, SplitwiseExpenseSplit, SplitwiseImportRow } from '../types'
import { SplitInput } from '../components/SplitInput'
import { DateFilter } from '../components/DateFilter'
import { useGroups } from '../hooks/useGroups'
import { useCategories } from '../hooks/useCategories'
import { ReceiptPanel } from '../components/ReceiptPanel'
import { buildParts, exclusiveTotals, partsError, SendPart } from '../receiptSplit'

interface Props {
  expenses: Expense[]
  onUpdate: (id: string, patch: Partial<Expense>) => void
  onRemove: (id: string) => void
  onSent: (results: SendResult[]) => void
}

function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

function parseSentId(id: string): { date: string; amount: number } | null {
  if (!id.startsWith('sent-')) return null
  return { date: id.slice(5, 15), amount: parseFloat(id.slice(16)) }
}

function parseSplitwiseImportId(id: string): { date: string; amount: number } | null {
  if (!id.startsWith('splitwise-')) return null
  const rest = id.slice(10)
  const date = rest.slice(0, 10)
  const amount = parseFloat(rest.slice(11))
  if (!date || isNaN(amount)) return null
  return { date, amount }
}

function parseSplits(raw: string): SplitwiseExpenseSplit[] {
  try { return JSON.parse(raw) ?? [] } catch { return [] }
}

interface HistoryMatch {
  label: string
  date: string
  description: string
  amount: number
  payerName?: string
  splits?: SplitwiseExpenseSplit[]
}

export function Expenses({ expenses, onUpdate, onRemove, onSent }: Props) {
  const { groups } = useGroups()
  const { parents, childrenOf } = useCategories()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Record<string, SendResult>>({})
  const [dateRange, setDateRange] = useState({ from: monthStart(), to: today() })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [receiptOpenId, setReceiptOpenId] = useState<string | null>(null)
  const [historySent, setHistorySent] = useState<SentExpense[]>([])
  const [historyImported, setHistoryImported] = useState<SplitwiseImportRow[]>([])

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => {
        setHistorySent(data.sent ?? [])
        setHistoryImported(data.imported ?? [])
      })
      .catch(() => {})
  }, [])

  function findHistoryMatch(expense: Expense): HistoryMatch | null {
    const d = new Date(expense.date).getTime()
    for (const h of historySent) {
      if (h.amount === expense.amount && Math.abs(new Date(h.date).getTime() - d) <= 86_400_000)
        return { label: 'Já enviada ao Splitwise', date: h.date, description: h.description, amount: h.amount }
    }
    for (const h of historyImported) {
      if (h.amount === expense.amount && Math.abs(new Date(h.date).getTime() - d) <= 86_400_000)
        return {
          label: 'Já no Splitwise',
          date: h.date,
          description: h.description,
          amount: h.amount,
          payerName: h.payer_name || undefined,
          splits: parseSplits(h.splits),
        }
    }
    return null
  }

  const filtered = expenses
    .filter(e => (!dateRange.from || e.date >= dateRange.from) && (!dateRange.to || e.date <= dateRange.to))
    .sort((a, b) => b.date.localeCompare(a.date))

  function toggleCheck(id: string) {
    setChecked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleAll() {
    setChecked(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(e => e.id)))
  }

  function defaultSplits(groupId: number) {
    const group = groups.find(g => g.id === groupId)
    return group?.members.map(m => ({ userId: m.id, percent: 50 })) ?? []
  }

  async function sendExpenses(ids: string[]) {
    const toSend = expenses.filter(e => ids.includes(e.id) && e.groupId && e.payerId)
    if (!toSend.length) { alert('Preencha Grupo e Pagante em todas as despesas selecionadas.'); return }
    const invalid = toSend.find(e => partsError(e))
    if (invalid) { alert(`${invalid.description}: ${partsError(invalid)}`); return }

    setSending(new Set(ids))

    // Itens exclusivos da nota viram despesas separadas
    const partsByExpense = new Map<string, SendPart[]>(toSend.map(e => [e.id, buildParts(
      { ...e, groupId: e.groupId!, payerId: e.payerId!, splits: e.splits ?? defaultSplits(e.groupId!) },
      groups.find(g => g.id === e.groupId)?.members ?? [],
    )]))

    const res = await fetch('/api/splitwise/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([...partsByExpense.values()].flat()),
    })
    const partResults: SendResult[] = await res.json()

    const data: SendResult[] = toSend.map(e => {
      const parts = partResults.filter(r => partsByExpense.get(e.id)!.some(p => p.id === r.id))
      const okIds = parts.filter(r => r.ok).map(r => r.id)
      const failed = parts.filter(r => !r.ok)
      if (failed.length && okIds.length) onUpdate(e.id, { sentParts: [...(e.sentParts ?? []), ...okIds] })
      return failed.length
        ? { id: e.id, ok: false, error: failed.map(r => r.error).join(' | ') }
        : { id: e.id, ok: true, splitwiseId: parts[0]?.splitwiseId }
    })

    const map: Record<string, SendResult> = {}
    data.forEach(r => { map[r.id] = r })
    setResults(prev => ({ ...prev, ...map }))
    setSending(new Set())
    onSent(data)
  }

  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, background: '#f3f4f6' }
  const td: React.CSSProperties = { padding: '6px 10px', verticalAlign: 'middle' }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Despesas ({expenses.length})</h2>
        <button
          onClick={() => sendExpenses([...checked])}
          disabled={checked.size === 0}
          style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 20px', fontSize: 14, cursor: checked.size ? 'pointer' : 'not-allowed',
            opacity: checked.size ? 1 : 0.5 }}>
          Enviar selecionadas ({checked.size})
        </button>
      </div>

      <DateFilter value={dateRange} onChange={setDateRange} />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}><input type="checkbox" onChange={toggleAll} checked={checked.size === filtered.length && filtered.length > 0} /></th>
              <th style={th}>Data</th>
              <th style={th}>Descrição</th>
              <th style={th}>Valor</th>
              <th style={th}>Grupo</th>
              <th style={th}>Pagante</th>
              <th style={th}>Divisão</th>
              <th style={th}>Categoria</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const result = results[e.id]
              const isSending = sending.has(e.id)
              const group = groups.find(g => g.id === e.groupId)
              const splits = e.splits ?? (e.groupId ? defaultSplits(e.groupId) : [])
              const isExpanded = expandedId === e.id
              const receiptOpen = receiptOpenId === e.id
              const exclusiveCount = exclusiveTotals(e).size

              const historyMatch = findHistoryMatch(e)
              const hasWarning = !!historyMatch || e.duplicate
              const rowBg = historyMatch ? '#fef2f2' : e.duplicate ? '#fff7ed' : '#fff'

              const compareMatch: HistoryMatch | null = historyMatch ?? (() => {
                const dupOther = e.duplicateOf ? expenses.find(x => x.id === e.duplicateOf) : undefined
                const dupSent = e.duplicateOf ? parseSentId(e.duplicateOf) : null
                const dupSw = e.duplicateOf ? parseSplitwiseImportId(e.duplicateOf) : null
                if (!e.duplicateOf) return null
                return {
                  label: dupSw ? 'Já no Splitwise' : dupSent ? 'Já enviada ao Splitwise' : 'Já na lista',
                  date: dupOther?.date ?? dupSw?.date ?? dupSent?.date ?? '?',
                  description: dupOther?.description ?? (dupSw ? '(importada do Splitwise)' : dupSent ? '(enviada ao Splitwise)' : '?'),
                  amount: dupOther?.amount ?? dupSw?.amount ?? dupSent?.amount ?? 0,
                }
              })()

              return (
                <React.Fragment key={e.id}>
                  <tr style={{ borderBottom: isExpanded || receiptOpen ? 'none' : '1px solid #f0f0f0', background: rowBg }}>
                    <td style={td}><input type="checkbox" checked={checked.has(e.id)} onChange={() => toggleCheck(e.id)} /></td>
                    <td style={td}>{e.date}</td>
                    <td style={td}>
                      <input value={e.description} onChange={ev => onUpdate(e.id, { description: ev.target.value })}
                        style={{ width: 200, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13 }} />
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>R$ {e.amount.toFixed(2)}</td>
                    <td style={td}>
                      <select value={e.groupId ?? ''} onChange={ev => onUpdate(e.id, { groupId: Number(ev.target.value), splits: undefined })}
                        style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13 }}>
                        <option value="">-- grupo --</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={e.payerId ?? ''} onChange={ev => onUpdate(e.id, { payerId: Number(ev.target.value) })}
                        disabled={!group}
                        style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13 }}>
                        <option value="">-- pagante --</option>
                        {group?.members.map(m => <option key={m.id} value={m.id}>{m.firstName}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      {group?.members && (
                        <SplitInput members={group.members} splits={splits}
                          onChange={s => onUpdate(e.id, { splits: s })} />
                      )}
                    </td>
                    <td style={td}>
                      <select
                        value={e.categoryId ?? ''}
                        onChange={ev => onUpdate(e.id, { categoryId: ev.target.value ? Number(ev.target.value) : undefined })}
                        style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 13, maxWidth: 160 }}
                      >
                        <option value="">{parents.length === 0 ? '(sincronize em Histórico)' : '-- categoria --'}</option>
                        {parents.map(p => (
                          <optgroup key={p.id} label={p.name}>
                            {childrenOf(p.id).map(sub => (
                              <option key={sub.id} value={sub.id}>{sub.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      {isSending && <span style={{ color: '#4f46e5' }}>Enviando...</span>}
                      {result && (result.ok
                        ? <span style={{ color: '#16a34a' }}>✓ ID {result.splitwiseId}</span>
                        : <span style={{ color: '#dc2626', fontSize: 11 }}>✗ {result.error}</span>)}
                      {!isSending && !result && hasWarning && (
                        <span
                          onClick={() => setExpandedId(prev => prev === e.id ? null : e.id)}
                          style={{
                            background: historyMatch ? '#fca5a5' : '#fde68a',
                            padding: '2px 8px', borderRadius: 12, fontSize: 11,
                            cursor: 'pointer', userSelect: 'none',
                          }}
                        >
                          {historyMatch ? historyMatch.label : 'Duplicata?'} {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setReceiptOpenId(prev => prev === e.id ? null : e.id)}
                          title="Itens da nota fiscal"
                          style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 4, whiteSpace: 'nowrap',
                            border: '1px solid #c7d2fe', background: receiptOpen ? '#e0e7ff' : '#fff',
                            color: e.receipt || e.receiptKey ? '#4338ca' : '#9ca3af' }}>
                          🧾 {e.receipt ? `${e.receipt.items.length} itens${exclusiveCount ? ` · ${exclusiveCount} só` : ''}` : 'Nota'}
                        </button>
                        {!result?.ok && (
                          <button onClick={() => sendExpenses([e.id])} disabled={isSending || !e.groupId || !e.payerId}
                            title="Enviar esta despesa"
                            style={{ padding: '3px 10px', fontSize: 12, cursor: 'pointer', background: '#4f46e5',
                              color: '#fff', border: 'none', borderRadius: 4 }}>
                            Enviar
                          </button>
                        )}
                        <button onClick={() => onRemove(e.id)}
                          style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#f3f4f6',
                            border: 'none', borderRadius: 4, color: '#dc2626' }}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                  {receiptOpen && (
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <ReceiptPanel expense={e} group={group} onUpdate={patch => onUpdate(e.id, patch)} />
                      </td>
                    </tr>
                  )}
                  {hasWarning && isExpanded && compareMatch && (
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <div style={{ display: 'flex', gap: 12, padding: '10px 16px', background: historyMatch ? '#fff1f2' : '#fffbeb', borderTop: `1px solid ${historyMatch ? '#fca5a5' : '#fde68a'}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.05em', marginBottom: 4 }}>ESTA DESPESA</div>
                            <div style={{ fontWeight: 600 }}>{e.date}</div>
                            <div style={{ color: '#374151', fontSize: 12 }}>{e.description}</div>
                            <div>R$ {e.amount.toFixed(2)}</div>
                          </div>
                          <div style={{ width: 1, background: historyMatch ? '#fca5a5' : '#fde68a', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.05em', marginBottom: 4 }}>
                              {compareMatch.label.toUpperCase()}
                            </div>
                            <div style={{ fontWeight: 600 }}>{compareMatch.date}</div>
                            <div style={{ color: '#374151', fontSize: 12 }}>{compareMatch.description}</div>
                            <div>R$ {compareMatch.amount.toFixed(2)}</div>
                            {compareMatch.payerName && (
                              <div style={{ fontSize: 12, marginTop: 4, color: '#374151' }}>
                                <span style={{ color: '#92400e', fontWeight: 600 }}>Pagante:</span> {compareMatch.payerName}
                              </div>
                            )}
                            {compareMatch.splits && compareMatch.splits.length > 0 && (
                              <div style={{ fontSize: 12, marginTop: 2, color: '#374151' }}>
                                <span style={{ color: '#92400e', fontWeight: 600 }}>Divisão:</span>{' '}
                                {compareMatch.splits.map(s => `${s.name} ${s.owedPercent}%`).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
            Nenhuma despesa no período. <a href="/import" style={{ color: '#4f46e5' }}>Importar</a>
          </p>
        )}
      </div>
    </div>
  )
}
