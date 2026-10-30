import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Import } from './pages/Import'
import { Expenses } from './pages/Expenses'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { Expense, SendResult } from './types'

const nav: React.CSSProperties = {
  display: 'flex', gap: 0, background: '#1e1b4b', padding: '0 24px',
}
const link = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: '14px 20px', color: isActive ? '#fff' : '#a5b4fc',
  textDecoration: 'none', fontWeight: isActive ? 600 : 400, fontSize: 14,
  borderBottom: isActive ? '2px solid #818cf8' : '2px solid transparent',
})

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([])

  useEffect(() => {
    fetch('/api/pending')
      .then(r => r.json())
      .then((data: Expense[]) => { if (Array.isArray(data)) setExpenses(data) })
      .catch(() => {})
  }, [])

  function addExpenses(incoming: Expense[]) {
    setExpenses(prev => {
      const ids = new Set(prev.map(e => e.id))
      const next = [...prev, ...incoming.filter(e => !ids.has(e.id))]
      fetch('/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {})
      return next
    })
  }

  function updateExpense(id: string, patch: Partial<Expense>) {
    setExpenses(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...patch } : e)
      fetch('/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {})
      return next
    })
  }

  function removeExpense(id: string) {
    fetch(`/api/pending/${id}`, { method: 'DELETE' }).catch(() => {})
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  function handleSent(results: SendResult[]) {
    results.filter(r => r.ok).forEach(r => removeExpense(r.id))
  }

  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
        <nav style={nav}>
          <NavLink to="/import" style={link}>Importar</NavLink>
          <NavLink to="/expenses" style={link}>
            Despesas {expenses.length > 0 && <span style={{ background: '#818cf8', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{expenses.length}</span>}
          </NavLink>
          <NavLink to="/history" style={link}>Histórico</NavLink>
          <NavLink to="/settings" style={link}>Configurações</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<Import onAdd={addExpenses} onUpdate={updateExpense} existing={expenses} />} />
          <Route path="/import" element={<Import onAdd={addExpenses} onUpdate={updateExpense} existing={expenses} />} />
          <Route path="/expenses" element={<Expenses expenses={expenses} onUpdate={updateExpense} onRemove={removeExpense} onSent={handleSent} />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
