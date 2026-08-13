import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { Expense, NubankSection, CsvColumnInfo, CsvMapping } from '../types'

interface Props {
  onAdd: (expenses: Expense[]) => void
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
  const [mapping, setMapping] = useState<CsvMapping>(info.suggested)
  const set = (field: keyof CsvMapping) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setMapping(m => ({ ...m, [field]: e.target.value }))

  const fields: { key: keyof CsvMapping; label: string }[] = [
    { key: 'date', label: 'Data' },
    { key: 'desc', label: 'Descrição' },
    { key: 'amount', label: 'Valor' },
  ]

  const colIdx = (col: string) => info.headers.indexOf(col)
  const highlight = (colName: string) =>
    Object.values(mapping).includes(colName) ? '#eef2ff' : undefined

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 12 }}>Mapear colunas</h3>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {fields.map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5' }}>{label}</span>
            <select
              value={mapping[key]}
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

function PreviewTable({ expenses, selected, onToggle }: {
  expenses: Expense[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>☑</th>
            <th style={th}>Data</th>
            <th style={th}>Descrição</th>
            <th style={th}>Valor</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map(e => (
            <tr key={e.id} style={{ background: e.duplicate ? '#fff7ed' : '#fff', borderBottom: '1px solid #f0f0f0' }}>
              <td style={td}><input type="checkbox" checked={selected.has(e.id)} onChange={() => onToggle(e.id)} /></td>
              <td style={td}>{e.date}</td>
              <td style={td}>{e.description}</td>
              <td style={{ ...td, textAlign: 'right' }}>R$ {e.amount.toFixed(2)}</td>
              <td style={td}>
                {e.duplicate
                  ? <span style={{ background: '#fde68a', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>Possível duplicata</span>
                  : <span style={{ color: '#16a34a', fontSize: 11 }}>OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12 }
const td: React.CSSProperties = { padding: '8px 12px' }

// ── Main import page ────────────────────────────────────────────────────────

export function Import({ onAdd, existing }: Props) {
  const navigate = useNavigate()

  // PDF state
  const [sections, setSections] = useState<NubankSection[]>([])
  const [activeSections, setActiveSections] = useState<string[]>([])

  // CSV state
  const [csvInfo, setCsvInfo] = useState<CsvColumnInfo | null>(null)
  const [pendingCsvFile, setPendingCsvFile] = useState<File | null>(null)

  // Shared
  const [preview, setPreview] = useState<Expense[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({ date: '', description: '', amount: '' })

  function resetAll() {
    setSections([]); setCsvInfo(null); setPendingCsvFile(null); setPreview([])
  }

  function applyActiveSections(sects: NubankSection[], activeNames: string[]) {
    const expenses = sects.filter(s => activeNames.includes(s.name)).flatMap(s => s.expenses)
    setPreview(expenses)
    setSelected(new Set(expenses.filter(e => !e.duplicate).map(e => e.id)))
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
    setPreview(expenses)
    setSelected(new Set(expenses.filter(e => !e.duplicate).map(e => e.id)))
  }

  const onDropPdf = useCallback((files: File[]) => uploadPdf(files[0]), [existing])
  const onDropCsv = useCallback((files: File[]) => uploadCsvForColumns(files[0]), [existing])

  const { getRootProps: pdfProps, getInputProps: pdfInput, isDragActive: pdfDrag } =
    useDropzone({ onDrop: onDropPdf, accept: { 'application/pdf': ['.pdf'] }, multiple: false })
  const { getRootProps: csvProps, getInputProps: csvInput, isDragActive: csvDrag } =
    useDropzone({ onDrop: onDropCsv, accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }, multiple: false })

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function confirm() {
    onAdd(preview.filter(e => selected.has(e.id)))
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
          <PreviewTable expenses={preview} selected={selected} onToggle={toggleSelect} />
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
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
