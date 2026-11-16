import React, { useEffect, useRef, useState } from 'react'
import { Expense, Group, Receipt } from '../types'
import { exclusiveTotals, partsError, sharedAmount } from '../receiptSplit'

interface Props {
  expense: Expense
  group?: Group
  onUpdate: (patch: Partial<Expense>) => void
  onSplit: (patch: Partial<Expense>, extracted: Expense) => void
}

const brl = (n: number) => `R$ ${n.toFixed(2)}`
const round2 = (n: number) => Math.round(n * 100) / 100

export function ReceiptPanel({ expense, group, onUpdate, onSplit }: Props) {
  const [key, setKey] = useState(expense.receiptKey ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()

  const receipt = expense.receipt
  const cleanKey = key.replace(/\D/g, '')
  const locked = (expense.sentParts?.length ?? 0) > 0

  async function fetchItems(k = cleanKey) {
    setLoading(true); setError(null); setPortalUrl(null)
    try {
      const res = await fetch(`/api/receipts/${k}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        if (data.portalUrl) setPortalUrl(data.portalUrl)
        return
      }
      onUpdate({ receiptKey: k, receipt: data as Receipt })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function uploadFile(file: File) {
    setLoading(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (cleanKey.length === 44) form.append('accessKey', cleanKey)
      const res = await fetch('/api/receipts/file', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setKey(data.accessKey)
      setPortalUrl(null)
      onUpdate({ receiptKey: data.accessKey, receipt: data as Receipt })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // On open: NFC-e returns the items directly; NF-e returns the portal link so the user can save the page
  useEffect(() => {
    if (!receipt && cleanKey.length === 44) fetchItems()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The panel must match the visible width of the horizontally scrolling area; if wider,
  // sticky hits the end of the cell and the panel gets clipped on the left when scrolled to the end
  useEffect(() => {
    let scroller = panelRef.current?.parentElement ?? null
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement
    if (!scroller) return
    const el = scroller
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function assign(indexes: number[], assignee: number | undefined) {
    if (!receipt) return
    const items = receipt.items.map((item, i) => (indexes.includes(i) ? { ...item, assignee } : item))
    onUpdate({ receipt: { ...receipt, items } })
  }

  // Moves these items out of this expense into a new one right below it, so it can be renamed.
  // assignee set = only that member pays (100%); empty = same split as the original.
  function separate(indexes: number[], assignee?: number) {
    if (!receipt || !indexes.length) return
    const moved = receipt.items.filter((_, i) => indexes.includes(i)).map(item => ({ ...item, assignee: undefined }))
    const kept = receipt.items.filter((_, i) => !indexes.includes(i))
    const amount = round2(moved.reduce((sum, item) => sum + item.amount, 0))
    const remaining = round2(expense.amount - amount)
    if (remaining <= 0) {
      setError('Os itens selecionados somam o valor todo da despesa; não sobra nada para separar.')
      return
    }

    const names = [...new Set(moved.map(item => item.description))]
    onSplit(
      {
        amount: remaining,
        receipt: { ...receipt, total: round2(receipt.total - amount), items: kept },
      },
      {
        id: `${expense.id}-${Date.now().toString(36)}`,
        date: expense.date,
        description: `${expense.description} - ${names.join(', ')}`,
        amount,
        source: expense.source,
        groupId: expense.groupId,
        payerId: expense.payerId,
        splits: assignee != null && group
          ? group.members.map(m => ({ userId: m.id, percent: m.id === assignee ? 100 : 0 }))
          : expense.splits,
        categoryId: expense.categoryId,
        receiptKey: expense.receiptKey,
        receipt: { ...receipt, total: amount, items: moved },
      },
    )
    setSelected(new Set())
    setError(null)
  }

  function toggleSelected(i: number) {
    setSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })
  }

  const memberName = (id: number) => group?.members.find(m => m.id === id)?.firstName ?? String(id)
  const btn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, cursor: 'pointer', border: '1px solid #c7d2fe', background: '#fff', borderRadius: 4, color: '#4338ca' }
  const td: React.CSSProperties = { padding: '3px 8px', fontSize: 12 }

  return (
    // sticky: the expenses table scrolls horizontally; the panel stays fixed in the visible area
    <div ref={panelRef} style={{ position: 'sticky', left: 0, width, maxWidth: width ?? 'calc(100vw - 48px)', boxSizing: 'border-box',
      padding: '12px 16px', background: '#f5f7ff', borderTop: '1px solid #c7d2fe' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', letterSpacing: '0.05em' }}>NOTA FISCAL</span>
        <input value={key} onChange={ev => setKey(ev.target.value)} placeholder="Chave de acesso (44 dígitos)"
          disabled={locked}
          style={{ width: 340, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }} />
        <button style={btn} disabled={loading || locked || cleanKey.length !== 44} onClick={() => fetchItems()}>
          {loading ? 'Buscando...' : receipt ? 'Buscar de novo' : 'Buscar itens'}
        </button>
        <button style={btn} disabled={loading || locked} onClick={() => fileRef.current?.click()}>
          Enviar arquivo (.html / .xml)
        </button>
        <input ref={fileRef} type="file" accept=".html,.htm,.xml" style={{ display: 'none' }}
          onChange={ev => ev.target.files?.[0] && uploadFile(ev.target.files[0])} />
        {receipt && !locked && (
          <button style={{ ...btn, color: '#dc2626', borderColor: '#fecaca' }}
            onClick={() => onUpdate({ receipt: undefined })}>
            Remover itens
          </button>
        )}
      </div>

      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>{error}</div>}
      {portalUrl && (
        <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: '#374151' }}>
          <li><a href={portalUrl} target="_blank" rel="noreferrer" style={{ color: '#4f46e5' }}>Abrir a nota no portal da SEFAZ ↗</a> e entrar com gov.br</li>
          <li>Na página da nota (em NF-e, clicar antes em <b>Consulta</b>), salvar com <b>Ctrl+S</b> (tipo: "Página da Web, completa")</li>
          <li>Enviar o arquivo .html salvo aqui em <b>Enviar arquivo</b></li>
        </ol>
      )}

      {receipt && (
        <>
          <div style={{ marginTop: 10, fontSize: 12, color: '#374151' }}>
            <b>{receipt.issuer}</b> · {receipt.model === '55' ? 'NF-e' : 'NFC-e'} · {receipt.items.length} itens · total {brl(receipt.total)}
            {Math.abs(receipt.total - expense.amount) > 0.009 && (
              <span style={{ marginLeft: 8, color: '#b45309' }}>
                ⚠ Total da nota difere do valor da despesa ({brl(expense.amount)}); a diferença fica na parte dividida.
              </span>
            )}
          </div>

          {!locked && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
              <span>{selected.size} selecionado(s) →</span>
              <button style={btn} disabled={!selected.size} onClick={() => separate([...selected])}
                title="Cria uma despesa separada com esses itens, com a mesma divisão">
                Separar
              </button>
              {group?.members.map(m => (
                <button key={m.id} style={btn} disabled={!selected.size} onClick={() => separate([...selected], m.id)}
                  title={`Cria uma despesa separada com esses itens, 100% para ${m.firstName}`}>
                  Separar só {m.firstName}
                </button>
              ))}
              {!group && <span style={{ color: '#b45309' }}>Escolha o grupo da despesa para separar itens só de um membro.</span>}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, background: '#fff' }}>
            <thead>
              <tr style={{ background: '#eef2ff', textAlign: 'left' }}>
                <th style={td}>
                  <input type="checkbox" disabled={locked}
                    checked={selected.size === receipt.items.length}
                    onChange={() => setSelected(prev => prev.size === receipt.items.length ? new Set() : new Set(receipt.items.map((_, i) => i)))} />
                </th>
                <th style={td}>Item</th>
                <th style={{ ...td, textAlign: 'right' }}>Qtd</th>
                <th style={{ ...td, textAlign: 'right' }}>Valor</th>
                <th style={td}>Quem paga</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0f0f0', background: item.assignee != null ? '#fefce8' : undefined }}>
                  <td style={td}>
                    <input type="checkbox" disabled={locked} checked={selected.has(i)} onChange={() => toggleSelected(i)} />
                  </td>
                  <td style={td}>{item.description}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: '#6b7280' }}>
                    {item.quantity.toLocaleString('pt-BR')} {item.unit}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {brl(item.amount)}
                    {item.amount !== item.total && (
                      <span style={{ color: '#9ca3af', textDecoration: 'line-through', marginLeft: 6 }}>{item.total.toFixed(2)}</span>
                    )}
                  </td>
                  <td style={td}>
                    <select value={item.assignee ?? ''} disabled={!group || locked}
                      onChange={ev => ev.target.value ? separate([i], Number(ev.target.value)) : assign([i], undefined)}
                      style={{ padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12 }}>
                      <option value="">Dividir no grupo</option>
                      {group?.members.map(m => <option key={m.id} value={m.id}>Só {m.firstName}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Dividido no grupo: <b>{brl(sharedAmount(expense))}</b></span>
            {[...exclusiveTotals(expense)].map(([userId, amount]) => (
              <span key={userId}>Só {memberName(userId)}: <b>{brl(amount)}</b>{' '}
                <span style={{ color: '#6b7280' }}>
                  {userId === expense.payerId ? '(é o pagante: fica fora do Splitwise)' : '(despesa separada)'}
                </span>
              </span>
            ))}
            {partsError(expense) && <span style={{ color: '#b91c1c' }}>{partsError(expense)}</span>}
            {locked && <span style={{ color: '#6b7280' }}>Parte já enviada; itens bloqueados.</span>}
          </div>
        </>
      )}
    </div>
  )
}
