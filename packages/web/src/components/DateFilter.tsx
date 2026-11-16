interface DateRange { from: string; to: string }

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
}

function local(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function today() { return local(new Date()) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return local(d)
}
function monthStart(offset = 0) {
  const d = new Date(); return local(new Date(d.getFullYear(), d.getMonth() + offset, 1))
}
function monthEnd(offset = 0) {
  const d = new Date(); return local(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0))
}

// Earlier than any Splitwise expense (Splitwise launched in 2011)
export const ALL_FROM = '2010-01-01'

export function DateFilter({ value, onChange }: Props) {
  const presets = [
    { label: 'Mês atual',    from: monthStart(0),  to: monthEnd(0) },
    { label: 'Mês anterior', from: monthStart(-1), to: monthEnd(-1) },
    { label: 'Últimos 30d',  from: daysAgo(30),    to: today() },
    { label: 'Últimos 12 meses', from: monthStart(-11), to: monthEnd(0) },
    { label: 'Este ano',     from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` },
    { label: 'Tudo',         from: ALL_FROM,       to: today() },
  ]

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      {presets.map(p => (
        <button key={p.label} onClick={() => onChange({ from: p.from, to: p.to })}
          style={{ padding: '4px 10px', cursor: 'pointer',
            background: value.from === p.from && value.to === p.to ? '#4f46e5' : '#f3f4f6',
            color: value.from === p.from && value.to === p.to ? '#fff' : '#111',
            border: 'none', borderRadius: 6, fontSize: 13 }}>
          {p.label}
        </button>
      ))}
      <input type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })}
        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
      <span style={{ color: '#888' }}>→</span>
      <input type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })}
        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
    </div>
  )
}
