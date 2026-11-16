import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Expense, NubankSection, CsvColumnInfo, CsvMapping } from '../types'
import { useGroups } from '../hooks/useGroups'
import { useCategories } from '../hooks/useCategories'
import { SplitInput } from '../components/SplitInput'

interface Props {
  onAdd: (expenses: Expense[]) => void
  onUpdate: (id: string, patch: Partial<Expense>) => void
  existing: Expense[]
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Column mapping UI ───────────────────────────────────────────────────────

function ColumnMapper({ info, onConfirm, onCancel }: {
  info: CsvColumnInfo
  onConfirm: (mapping: CsvMapping) => void
  onCancel: () => void
}) {
  const [mapping, setMapping] = useState<CsvMapping>({ ...info.suggested, key: info.suggested.key ?? '' })
  const set = (field: keyof CsvMapping) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setMapping(m => ({ ...m, [field]: e.target.value }))

  const fields: { key: keyof CsvMapping; label: string }[] = [
    { key: 'date', label: 'Data' },
    { key: 'desc', label: 'Descrição' },
    { key: 'amount', label: 'Valor' },
    { key: 'key', label: 'Chave NF-e (opcional)' },
  ]

  const colIdx = (col: string) => info.headers.indexOf(col)
  const highlight = (colName: string) =>
    colName && Object.values(mapping).includes(colName) ? '#eef2ff' : undefined

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 12 }}>Mapear colunas</h3>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {fields.map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5' }}>{label}</span>
            <select
              value={mapping[key] ?? ''}
              onChange={set(key)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="">(nenhuma)</option>
              {info.headers.map(h => <option key={h} value={h}>{h || '(vazio)'}</option>)}
            </select>
          </label>
        ))}
      </div>

      {info.sample.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                {info.headers.map(h => (
                  <th key={h} style={{
                    padding: '4px 8px', textAlign: 'left', fontWeight: 600,
                    background: highlight(h) ?? '#f3f4f6',
                    border: '1px solid #e5e7eb', whiteSpace: 'nowrap',
                  }}>
                    {h || '(vazio)'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {info.sample.map((row, i) => (
                <tr key={i}>
                  {info.headers.map((h, j) => (
                    <td key={j} style={{
                      padding: '4px 8px', border: '1px solid #e5e7eb',
                      background: highlight(h), maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {row[j] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => onConfirm(mapping)}
          disabled={!mapping.date || !mapping.desc || !mapping.amount}
          style={{
            background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 22px', fontSize: 14, cursor: 'pointer',
            opacity: (!mapping.date || !mapping.desc || !mapping.amount) ? 0.5 : 1,
          }}
        >
          Importar com esse mapeamento
        </button>
        <button
          onClick={onCancel}
          style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Section picker (PDF) ────────────────────────────────────────────────────

function SectionPicker({ sections, active, onChange }: {
  sections: NubankSection[]
  active: string[]
  onChange: (names: string[]) => void
}) {
  const allNames = sections.map(s => s.name)

  function toggle(name: string) {
    onChange(active.includes(name) ? active.filter(n => n !== name) : [...active, name])
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontWeight: 600, marginBottom: 10 }}>Escolha quais seções importar:</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {sections.map(s => {
          const on = active.includes(s.name)
          return (
            <button key={s.name} onClick={() => toggle(s.name)} style={{
              padding: '10px 18px', borderRadius: 8,
              border: `2px solid ${on ? '#4f46e5' : '#d1d5db'}`,
              background: on ? '#eef2ff' : '#fff',
              color: on ? '#4f46e5' : '#374151',
              fontWeight: on ? 700 : 400, cursor: 'pointer', fontSize: 14,
            }}>
              {s.name || 'Sem nome'}<br />
              <span style={{ fontSize: 12, fontWeight: 400 }}>R$ {fmt(s.total)} · {s.expenses.length} lançamentos</span>
            </button>
          )
        })}
        {sections.length > 1 && (
          <button onClick={() => onChange(allNames)} style={{
            padding: '10px 18px', borderRadius: 8,
            border: `2px solid ${active.length === sections.length ? '#4f46e5' : '#d1d5db'}`,
            background: active.length === sections.length ? '#eef2ff' : '#fff',
            color: active.length === sections.length ? '#4f46e5' : '#374151',
            fontWeight: active.length === sections.length ? 700 : 400, cursor: 'pointer', fontSize: 14,
          }}>
            Todas as seções<br />
            <span style={{ fontSize: 12, fontWeight: 400 }}>
              {sections.reduce((n, s) => n + s.expenses.length, 0)} lançamentos
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Preview table ───────────────────────────────────────────────────────────

function parseSentId(id: string): { date: string; amount: number } | null {
  if (!id.startsWith('sent-')) return null
  return { date: id.slice(5, 15), amount: parseFloat(id.slice(16)) }
}

// format: splitwise-{YYYY-MM-DD}-{amount}
function parseSplitwiseImportId(id: string): { date: string; amount: number } | null {
  if (!id.startsWith('splitwise-')) return null
  const rest = id.slice(10)
  const date = rest.slice(0, 10)
  const amount = parseFloat(rest.slice(11))
  if (!date || isNaN(amount)) return null
  return { date, amount }
}

// What to do with an imported row that matches another expense:
// existing = keep the existing one (skip import), incoming = replace with the imported one,
// merge = merge both, both = keep both (import as new)
type Resolution = 'existing' | 'incoming' | 'merge' | 'both'

// Only expenses still in the list (pending) can be replaced/merged;
// ones already sent or imported from Splitwise can only be skipped or duplicated
function pendingMatch(expense: Expense, existing: Expense[]): Expense | undefined {
  return expense.duplicateOf ? existing.find(e => e.id === expense.duplicateOf) : undefined
}

function defaultResolution(expense: Expense, existing: Expense[]): Resolution {
  const other = pendingMatch(expense, existing)
  // Typical case: the receipt has the access key the card statement lacks
  if (other && expense.receiptKey && !other.receiptKey) return 'merge'
  return 'existing'
}

function olderDate(a: string, b: string) {
  return a && (!b || a <= b) ? a : b
}

// Merge keeps the listed expense (id, group, split, fetched receipt) and fills in
// what the imported one adds — mainly the NF-e access key. The oldest date wins.
function mergeExpenses(other: Expense, incoming: Expense): Partial<Expense> {
  return {
    date: olderDate(other.date, incoming.date),
    description: other.description || incoming.description,
    receiptKey: other.receiptKey ?? incoming.receiptKey,
    categoryId: other.categoryId ?? incoming.categoryId,
  }
}

function shortKey(key?: string) {
  return key ? `…${key.slice(-8)}` : '—'
}

function DuplicateCompare({ expense, existing, resolution, onResolve }: {
  expense: Expense
  existing: Expense[]
  resolution: Resolution
  onResolve: (r: Resolution) => void
}) {
  const id = expense.duplicateOf ?? ''
  const other = pendingMatch(expense, existing)
  const sent = parseSentId(id)
  const sw = parseSplitwiseImportId(id)

  const otherDate = other?.date ?? sent?.date ?? sw?.date ?? '?'
  const otherAmount = other?.amount ?? sent?.amount ?? sw?.amount ?? 0
  const otherDesc = other?.description || (sw ? '(já no Splitwise)' : sent ? '(enviada ao Splitwise)' : '?')
  const otherLabel = sw ? 'Já no Splitwise' : sent ? 'Já enviada ao Splitwise' : 'Já na lista'

  const incomingOlder = otherDate !== '?' && expense.date < otherDate
  const otherOlder = otherDate !== '?' && otherDate < expense.date

  // Highlights the version(s) that will remain after the choice
  const kept = (side: 'incoming' | 'existing') =>
    resolution === 'both' || resolution === 'merge' || resolution === side
  const card = (side: 'incoming' | 'existing'): React.CSSProperties => ({
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: 8, borderRadius: 6,
    border: `2px solid ${kept(side) ? '#f59e0b' : 'transparent'}`,
    opacity: kept(side) ? 1 : 0.55,
  })
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.05em', marginBottom: 4 }
  const oldest = (
    <span style={{ marginLeft: 6, background: '#dbeafe', color: '#1e40af', padding: '0 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
      mais antiga
    </span>
  )

  const options: { value: Resolution; label: string; enabled: boolean }[] = [
    { value: 'existing', label: other ? 'Manter a da lista' : 'Ignorar importada', enabled: true },
    { value: 'incoming', label: 'Usar a importada', enabled: !!other },
    { value: 'merge', label: 'Mesclar', enabled: !!other },
    { value: 'both', label: 'Manter ambas', enabled: true },
  ]
  const merged = other && resolution === 'merge' ? mergeExpenses(other, expense) : null

  return (
    <div style={{ padding: '10px 16px', background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={card('incoming')}>
          <div style={label}>IMPORTANDO</div>
          <div style={{ fontWeight: 600 }}>{expense.date}{incomingOlder && oldest}</div>
          <div style={{ color: '#374151', fontSize: 12 }}>{expense.description}</div>
          <div>R$ {expense.amount.toFixed(2)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Chave NF-e: {shortKey(expense.receiptKey)}</div>
        </div>
        <div style={{ width: 1, background: '#fde68a', flexShrink: 0 }} />
        <div style={card('existing')}>
          <div style={label}>{otherLabel.toUpperCase()}</div>
          <div style={{ fontWeight: 600 }}>{otherDate}{otherOlder && oldest}</div>
          <div style={{ color: '#374151', fontSize: 12 }}>{otherDesc}</div>
          <div>R$ {otherAmount.toFixed(2)}</div>
          {other && <div style={{ fontSize: 11, color: '#6b7280' }}>Chave NF-e: {shortKey(other.receiptKey)}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {options.filter(o => o.enabled).map(o => (
          <button key={o.value} onClick={() => onResolve(o.value)} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${resolution === o.value ? '#d97706' : '#e5e7eb'}`,
            background: resolution === o.value ? '#fde68a' : '#fff',
            fontWeight: resolution === o.value ? 600 : 400,
          }}>
            {o.label}
          </button>
        ))}
        {merged && (
          <span style={{ fontSize: 12, color: '#374151', marginLeft: 6 }}>
            Resultado: {merged.date} · {merged.description} · chave {shortKey(merged.receiptKey)}
          </span>
        )}
      </div>
    </div>
  )
}

const resolutionBadge: Record<Resolution, string> = {
  existing: 'Duplicata · ignorar',
  incoming: 'Duplicata · substituir',
  merge: 'Duplicata · mesclar',
  both: 'Duplicata · manter ambas',
}

function PreviewTable({ expenses, selected, onToggle, onToggleAll, existing, resolutions, onResolve }: {
  expenses: Expense[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  existing: Expense[]
  resolutions: Record<string, Resolution>
  onResolve: (id: string, r: Resolution) => void
}) {
  const allSelected = expenses.length > 0 && expenses.every(e => selected.has(e.id))
  const someSelected = !allSelected && expenses.some(e => selected.has(e.id))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  return (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected }}
                onChange={onToggleAll}
              />
            </th>
            <th style={th}>Data</th>
            <th style={th}>Descrição</th>
            <th style={th}>Valor</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map(e => (
            <React.Fragment key={e.id}>
              <tr
                onClick={() => onToggle(e.id)}
                style={{ background: e.duplicate ? '#fff7ed' : '#fff', borderBottom: expandedId === e.id ? 'none' : '1px solid #f0f0f0', cursor: 'pointer' }}
              >
                <td style={td} onClick={ev => ev.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => onToggle(e.id)} />
                </td>
                <td style={td}>{e.date}</td>
                <td style={td}>{e.description}</td>
                <td style={{ ...td, textAlign: 'right' }}>R$ {e.amount.toFixed(2)}</td>
                <td style={td} onClick={ev => { if (e.duplicate) { ev.stopPropagation(); toggleExpand(e.id) } }}>
                  {e.duplicate
                    ? <span style={{ background: '#fde68a', padding: '2px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
                        {resolutionBadge[resolutions[e.id] ?? 'existing']} {expandedId === e.id ? '▲' : '▼'}
                      </span>
                    : <span style={{ color: '#16a34a', fontSize: 11 }}>OK</span>}
                </td>
              </tr>
              {e.duplicate && expandedId === e.id && (
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <DuplicateCompare expense={e} existing={existing}
                      resolution={resolutions[e.id] ?? 'existing'} onResolve={r => onResolve(e.id, r)} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }
const td: React.CSSProperties = { padding: '8px 12px' }

// ── Main import page ────────────────────────────────────────────────────────

export function Import({ onAdd, onUpdate, existing }: Props) {
  const navigate = useNavigate()
  const { groups } = useGroups()
  const { parents, childrenOf } = useCategories()

  // PDF state
  const [sections, setSections] = useState<NubankSection[]>([])
  const [activeSections, setActiveSections] = useState<string[]>([])

  // CSV state
  const [csvInfo, setCsvInfo] = useState<CsvColumnInfo | null>(null)
  const [pendingCsvFile, setPendingCsvFile] = useState<File | null>(null)

  // Shared
  const [preview, setPreview] = useState<Expense[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({ date: '', description: '', amount: '' })

  // Default group / payer / splits / category applied to all expenses on confirm
  const [defaultGroupId, setDefaultGroupId] = useState<number | undefined>()
  const [defaultPayerId, setDefaultPayerId] = useState<number | undefined>()
  const [defaultSplits, setDefaultSplits] = useState<{ userId: number; percent: number }[] | undefined>()
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | undefined>()

  const defaultGroup = groups.find(g => g.id === defaultGroupId)

  function handleDefaultGroupChange(id: number | undefined) {
    setDefaultGroupId(id)
    setDefaultPayerId(undefined)
    setDefaultSplits(undefined)
    setDefaultCategoryId(undefined)
  }

  function resetAll() {
    setSections([]); setCsvInfo(null); setPendingCsvFile(null); setPreview([])
  }

  function showPreview(expenses: Expense[]) {
    const res: Record<string, Resolution> = {}
    for (const e of expenses) if (e.duplicate) res[e.id] = defaultResolution(e, existing)
    setPreview(expenses)
    setResolutions(res)
    setSelected(new Set(expenses.filter(e => !e.duplicate || res[e.id] !== 'existing').map(e => e.id)))
  }

  function resolve(id: string, r: Resolution) {
    setResolutions(prev => ({ ...prev, [id]: r }))
    setSelected(prev => { const s = new Set(prev); r === 'existing' ? s.delete(id) : s.add(id); return s })
  }

  // Checking a duplicate applies the suggested action (or "keep both"); unchecking = skip
  function activeResolution(e: Expense): Resolution {
    const d = defaultResolution(e, existing)
    return d === 'existing' ? 'both' : d
  }

  function applyActiveSections(sects: NubankSection[], activeNames: string[]) {
    showPreview(sects.filter(s => activeNames.includes(s.name)).flatMap(s => s.expenses))
  }

  function handleSectionChange(names: string[]) {
    setActiveSections(names)
    applyActiveSections(sections, names)
  }

  // PDF upload
  async function uploadPdf(file: File) {
    setLoading(true); setError(''); resetAll()
    const form = new FormData()
    form.append('file', file)
    form.append('existing', JSON.stringify(existing))
    const res = await fetch('/api/import/pdf', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    const sects: NubankSection[] = data.sections ?? []
    setSections(sects)
    if (sects.length === 0) { setError('Nenhuma transação encontrada.'); return }
    const allNames = sects.map(s => s.name)
    setActiveSections(allNames)
    applyActiveSections(sects, allNames)
  }

  // CSV: first step — fetch column info
  async function uploadCsvForColumns(file: File) {
    setLoading(true); setError(''); resetAll()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/import/csv/columns', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setCsvInfo(data as CsvColumnInfo)
    setPendingCsvFile(file)
  }

  // CSV: second step — parse with confirmed mapping
  async function confirmCsvMapping(mapping: CsvMapping) {
    if (!pendingCsvFile) return
    setLoading(true); setError('')
    const form = new FormData()
    form.append('file', pendingCsvFile)
    form.append('mapping', JSON.stringify(mapping))
    form.append('existing', JSON.stringify(existing))
    const res = await fetch('/api/import/csv', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    const expenses: Expense[] = data
    setCsvInfo(null)
    showPreview(expenses)
  }

  const onDropPdf = useCallback((files: File[]) => uploadPdf(files[0]), [existing])
  const onDropCsv = useCallback((files: File[]) => uploadCsvForColumns(files[0]), [existing])

  const { getRootProps: pdfProps, getInputProps: pdfInput, isDragActive: pdfDrag } =
    useDropzone({ onDrop: onDropPdf, accept: { 'application/pdf': ['.pdf'] }, multiple: false })
  const { getRootProps: csvProps, getInputProps: csvInput, isDragActive: csvDrag } =
    useDropzone({ onDrop: onDropCsv, accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }, multiple: false })

  function toggleSelect(id: string) {
    const e = preview.find(x => x.id === id)
    if (e?.duplicate) { resolve(id, selected.has(id) ? 'existing' : activeResolution(e)); return }
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleSelectAll() {
    const allIds = preview.map(e => e.id)
    const allSelected = allIds.every(id => selected.has(id))
    setResolutions(prev => {
      const next = { ...prev }
      for (const e of preview) {
        if (!e.duplicate) continue
        if (allSelected) next[e.id] = 'existing'
        else if (next[e.id] === 'existing') next[e.id] = activeResolution(e)
      }
      return next
    })
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  function confirm() {
    const toAdd: Expense[] = []
    for (const e of preview.filter(x => selected.has(x.id))) {
      const r = e.duplicate ? resolutions[e.id] ?? 'existing' : 'both'
      const other = pendingMatch(e, existing)
      if (r === 'merge' && other) {
        onUpdate(other.id, mergeExpenses(other, e))
      } else if (r === 'incoming' && other) {
        // Update in place so the group/split already set on the listed expense is kept
        const keyChanged = e.receiptKey !== other.receiptKey
        onUpdate(other.id, {
          date: e.date, description: e.description, amount: e.amount, source: e.source,
          receiptKey: e.receiptKey,
          ...(keyChanged && { receipt: undefined }),
        })
      } else if (r !== 'existing') {
        toAdd.push({
          ...e,
          ...(defaultGroupId !== undefined && { groupId: defaultGroupId }),
          ...(defaultPayerId !== undefined && { payerId: defaultPayerId }),
          ...(defaultSplits !== undefined && { splits: defaultSplits }),
          ...(defaultCategoryId !== undefined && { categoryId: defaultCategoryId }),
        })
      }
    }
    onAdd(toAdd)
    resetAll(); setPreview([])
    navigate('/expenses')
  }

  async function addManual() {
    if (!manual.date || !manual.description || !manual.amount) return
    const res = await fetch('/api/import/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...manual, amount: parseFloat(manual.amount) }),
    })
    const expense = await res.json()
    onAdd([expense])
    setManual({ date: '', description: '', amount: '' })
    navigate('/expenses')
  }

  const dropStyle = (active: boolean): React.CSSProperties => ({
    border: `2px dashed ${active ? '#4f46e5' : '#d1d5db'}`,
    borderRadius: 12, padding: 24, textAlign: 'center',
    cursor: 'pointer', background: active ? '#eef2ff' : '#fafafa',
    transition: 'all .2s',
  })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Importar despesas</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <h4 style={{ marginBottom: 8 }}>📄 PDF Fatura</h4>
          <div {...pdfProps()} style={dropStyle(pdfDrag)}>
            <input {...pdfInput()} />
            {pdfDrag ? 'Solte aqui...' : 'Arraste o PDF ou clique'}
          </div>
        </div>

        <div>
          <h4 style={{ marginBottom: 8 }}>📊 CSV / Excel</h4>
          <div {...csvProps()} style={dropStyle(csvDrag)}>
            <input {...csvInput()} />
            {csvDrag ? 'Solte aqui...' : 'Arraste .csv ou .xlsx'}
          </div>
        </div>

        <div>
          <h4 style={{ marginBottom: 8 }}>✏️ Manual</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="date" value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
              style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            <input type="text" placeholder="Descrição" value={manual.description}
              onChange={e => setManual(m => ({ ...m, description: e.target.value }))}
              style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            <input type="number" placeholder="Valor (R$)" value={manual.amount}
              onChange={e => setManual(m => ({ ...m, amount: e.target.value }))}
              style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            <button onClick={addManual}
              style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', cursor: 'pointer' }}>
              Adicionar
            </button>
          </div>
        </div>
      </div>

      {loading && <p>Processando...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {sections.length > 1 && (
        <SectionPicker sections={sections} active={activeSections} onChange={handleSectionChange} />
      )}

      {csvInfo && (
        <ColumnMapper
          info={csvInfo}
          onConfirm={confirmCsvMapping}
          onCancel={resetAll}
        />
      )}

      {preview.length > 0 && (
        <>
          <h3>Prévia — {preview.length} lançamento(s)</h3>
          <PreviewTable expenses={[...preview].sort((a, b) => b.date.localeCompare(a.date))} selected={selected} onToggle={toggleSelect} onToggleAll={toggleSelectAll} existing={existing}
            resolutions={resolutions} onResolve={resolve} />

          <div style={{ marginTop: 16, padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 13 }}>Configuração padrão (opcional)</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Grupo</span>
                <select
                  value={defaultGroupId ?? ''}
                  onChange={e => handleDefaultGroupChange(e.target.value ? Number(e.target.value) : undefined)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                >
                  <option value="">-- nenhum --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>

              {defaultGroup && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Pagante</span>
                  <select
                    value={defaultPayerId ?? ''}
                    onChange={e => setDefaultPayerId(e.target.value ? Number(e.target.value) : undefined)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                  >
                    <option value="">-- nenhum --</option>
                    {defaultGroup.members.map(m => (
                      <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                    ))}
                  </select>
                </label>
              )}

              {defaultGroup?.members && defaultGroup.members.length === 2 && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Divisão</span>
                  <SplitInput
                    members={defaultGroup.members}
                    splits={defaultSplits ?? defaultGroup.members.map(m => ({ userId: m.id, percent: 50 }))}
                    onChange={setDefaultSplits}
                  />
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Categoria</span>
                <select
                  value={defaultCategoryId ?? ''}
                  onChange={e => setDefaultCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, maxWidth: 200 }}
                >
                  <option value="">{parents.length === 0 ? '(sincronize em Histórico)' : '-- nenhuma --'}</option>
                  {parents.map(p => (
                    <optgroup key={p.id} label={p.name}>
                      {childrenOf(p.id).map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <button onClick={confirm}
              style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 15, cursor: 'pointer' }}>
              Adicionar {selected.size} à lista
            </button>
            <button onClick={() => { resetAll(); setPreview([]) }}
              style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 15, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
