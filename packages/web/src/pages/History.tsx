import { useEffect, useState } from 'react'
import { DateFilter } from '../components/DateFilter'
import { SentExpense } from '../types'

function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export function History() {
  const [rows, setRows] = useState<SentExpense[]>([])
  const [dateRange, setDateRange] = useState({ from: monthStart(), to: today() })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to })
    fetch(`/api/history?${params}`)
      .then(r => r.json())
      .then(setRows)
      .finally(() => setLoading(false))
  }, [dateRange.from, dateRange.to])

  const total = rows.reduce((s, r) => s + r.amount, 0)

  const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, background: '#f3f4f6' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13 }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h2>Histórico</h2>
      <DateFilter value={dateRange} onChange={setDateRange} />
      {loading && <p>Carregando...</p>}
      {!loading && (
        <>
          <p style={{ color: '#555', fontSize: 13, marginBottom: 12 }}>
            {rows.length} despesa(s) · Total: R$ {total.toFixed(2)}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Data</th>
                  <th style={th}>Descrição</th>
                  <th style={th}>Valor</th>
                  <th style={th}>Grupo</th>
                  <th style={th}>Pagante</th>
                  <th style={th}>Splitwise ID</th>
                  <th style={th}>Enviado em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>{r.date}</td>
                    <td style={td}>{r.description}</td>
                    <td style={{ ...td, textAlign: 'right' }}>R$ {r.amount.toFixed(2)}</td>
                    <td style={td}>{r.group_name}</td>
                    <td style={td}>{r.payer_name}</td>
                    <td style={{ ...td, color: '#6366f1', fontFamily: 'monospace' }}>{r.splitwise_id}</td>
                    <td style={{ ...td, color: '#9ca3af' }}>{new Date(r.sent_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>Nenhuma despesa no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
