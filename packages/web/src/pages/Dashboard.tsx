import React, { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { DateFilter } from '../components/DateFilter'
import { MonthlyLineChart } from '../components/MonthlyLineChart'
import { useCategories } from '../hooks/useCategories'
import { SplitwiseImportRow } from '../types'
import { MONTHS_SHORT, formatMonth, groupLabel, money } from '../format'
import {
  CategoryKey, Measure, byCategory, byGroup, byMonth, byPayer, matchesCategory, monthsBetween, people, topCategory,
} from '../dashboard/aggregate'
import { INK, SERIES, axis, card, cardSub, cardTitle, compact, selectStyle as select, tooltipStyle } from '../dashboard/chartTheme'
import { ElectricitySection } from '../dashboard/ElectricitySection'

function local(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function last12Months() {
  const d = new Date()
  return { from: local(new Date(d.getFullYear(), d.getMonth() - 11, 1)), to: local(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
}

const label: React.CSSProperties = { fontSize: 12, color: INK.secondary, display: 'flex', flexDirection: 'column', gap: 4 }

export function Dashboard() {
  const [range, setRange] = useState(last12Months())
  const [rows, setRows] = useState<SplitwiseImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const { categories } = useCategories()

  const [personName, setPersonName] = useState('')   // '' = expense total
  const [currency, setCurrency] = useState('')
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set())
  const [categoryKey, setCategoryKey] = useState<CategoryKey | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/history?${new URLSearchParams({ from: range.from, to: range.to })}`)
      .then(r => r.json())
      .then(d => setRows(d.imported ?? []))
      .finally(() => setLoading(false))
  }, [range.from, range.to])

  const measure: Measure = personName ? { kind: 'person', name: personName } : { kind: 'total' }

  // ── Filters ────────────────────────────────────────────────────────────────
  // Known currencies, most used first. Rows without one ('' = synced before currency was tracked,
  // or no longer accessible on Splitwise) count as the only known currency when there is just one.
  const currencies = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of rows) if (r.currency_code) count.set(r.currency_code, (count.get(r.currency_code) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [rows])
  const singleCurrency = currencies.length <= 1
  const currencyOf = (r: SplitwiseImportRow) => r.currency_code || (singleCurrency ? currencies[0] ?? 'BRL' : '')
  const options = singleCurrency || !rows.some(r => !r.currency_code) ? currencies : [...currencies, '']
  const activeCurrency = options.includes(currency) ? currency
    : options.includes('BRL') ? 'BRL' : options[0] ?? 'BRL'
  const fmt = (n: number) => money(n, activeCurrency || 'BRL')

  const inCurrency = rows.filter(r => currencyOf(r) === activeCurrency)
  const groupNames = useMemo(() => [...new Set(inCurrency.map(groupLabel))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [inCurrency])
  const filtered = inCurrency.filter(r => !hiddenGroups.has(groupLabel(r)))
  const peopleList = useMemo(() => people(rows), [rows])

  // Chart months: the selected period, trimmed to the data and to the current month
  const dates = filtered.map(r => r.date).sort()
  const thisMonth = local(new Date()).slice(0, 7)
  const firstMonth = dates.length ? (dates[0].slice(0, 7) > range.from.slice(0, 7) ? dates[0].slice(0, 7) : range.from.slice(0, 7)) : ''
  const lastMonth = range.to.slice(0, 7) < thisMonth ? range.to.slice(0, 7) : thisMonth
  const months = firstMonth ? monthsBetween(firstMonth, lastMonth) : []
  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort().reverse()
  // The Linear / overlaid toggle only makes sense past one year of months
  const multiYear = months.length > 12 && years.length > 1

  // ── Category chart ─────────────────────────────────────────────────────────
  const categoryOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const r of filtered) if (r.category_id != null) seen.set(r.category_id, r.category_name)
    const byParent = new Map<string, { parentId: number | null; items: { id: number; name: string }[] }>()
    for (const [id, fallback] of seen) {
      const cat = categories.find(c => c.id === id)
      const parent = cat?.parent_id != null ? categories.find(c => c.id === cat.parent_id) : null
      const key = parent?.name ?? (cat?.parent_id == null && cat ? cat.name : 'Outras')
      const bucket = byParent.get(key) ?? { parentId: parent?.id ?? (cat && cat.parent_id == null ? cat.id : null), items: [] }
      bucket.items.push({ id, name: cat?.name ?? (fallback || `Categoria ${id}`) })
      byParent.set(key, bucket)
    }
    return [...byParent].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([name, b]) => ({ name, parentId: b.parentId, items: b.items.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')) }))
  }, [filtered, categories])

  const validKey = (k: CategoryKey | null) => !!k && (k.startsWith('p:')
    ? categoryOptions.some(o => o.parentId === Number(k.slice(2)))
    : categoryOptions.some(o => o.items.some(i => i.id === Number(k.slice(2)))))
  const activeCategory = validKey(categoryKey) ? categoryKey : topCategory(filtered, measure)
  const categoryRows = activeCategory ? filtered.filter(r => matchesCategory(r, activeCategory, categories)) : []
  const categoryMonthly = byMonth(categoryRows, measure, months)
  const categoryTotal = categoryMonthly.reduce((s, p) => s + p.value, 0)

  const categoryByMonth = new Map(categoryMonthly.map(p => [p.month, p.value]))

  // Latest year (possibly partial) vs the same months of the year before
  const latest = years[0]
  const latestMonths = months.filter(m => m.startsWith(latest ?? '-'))
  const prevMonths = latestMonths.map(m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`).filter(m => months.includes(m))
  const sumMonths = (list: string[]) => categoryMonthly.filter(p => list.includes(p.month)).reduce((s, p) => s + p.value, 0)
  const comparison = multiYear && prevMonths.length === latestMonths.length && latestMonths.length > 0
    ? { cur: sumMonths(latestMonths), prev: sumMonths(prevMonths) } : null

  // ── Other charts ───────────────────────────────────────────────────────────
  const monthly = byMonth(filtered, measure, months)
  const monthlyAvg = monthly.length ? monthly.reduce((s, p) => s + p.value, 0) / monthly.length : 0
  const ranking = byCategory(filtered, measure, categories)
  const groups = byGroup(filtered, measure)
  const payers = byPayer(filtered)

  const measureLabel = personName ? `Parte de ${personName}` : 'Total das despesas'
  const unknownCurrency = !singleCurrency && rows.some(r => !r.currency_code)
  const barHeight = (n: number) => Math.max(120, n * 30 + 30)

  function toggleGroup(g: string) {
    setHiddenGroups(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n })
  }

  const hbar = (data: { label: string; value: number }[], onClick?: (d: any) => void) => (
    <ResponsiveContainer width="100%" height={barHeight(data.length)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid horizontal={false} stroke={INK.grid} />
        <XAxis type="number" tickFormatter={compact} {...axis} />
        <YAxis type="category" dataKey="label" width={170} interval={0} {...axis}
          tickFormatter={(s: string) => s.length > 26 ? `${s.slice(0, 25)}…` : s} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f3f4f6' }} formatter={(v: any) => [fmt(Number(v)), measureLabel]} />
        <Bar dataKey="value" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}
          onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined} />
      </BarChart>
    </ResponsiveContainer>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 12 }}>Dashboard</h2>

      {/* ── Filters (one row above the charts) ───────────────────────────── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <DateFilter value={range} onChange={setRange} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={label}>
            Valor
            <select value={personName} onChange={e => setPersonName(e.target.value)} style={select}>
              <option value="">Total da despesa</option>
              {peopleList.map(p => <option key={p} value={p}>Parte de {p}</option>)}
            </select>
          </label>
          {options.length > 1 && (
            <label style={label}>
              Moeda
              <select value={activeCurrency} onChange={e => setCurrency(e.target.value)} style={select}>
                {options.map(c => <option key={c} value={c}>{c || 'Desconhecida'}</option>)}
              </select>
            </label>
          )}
          <div style={{ ...label, flex: 1, minWidth: 260 }}>
            Grupos
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {groupNames.map(g => {
                const on = !hiddenGroups.has(g)
                return (
                  <button key={g} onClick={() => toggleGroup(g)}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
                      border: `1px solid ${on ? '#4f46e5' : '#d1d5db'}`, background: on ? '#eef2ff' : '#fff',
                      color: on ? '#3730a3' : INK.muted }}>
                    {on ? '✓ ' : ''}{g}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {unknownCurrency && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#92400e' }}>
            Algumas despesas foram buscadas antes de o app guardar a moeda. Busque o histórico de novo na aba Histórico para identificá-la.
          </p>
        )}
      </div>

      {loading && <p>Carregando...</p>}
      {!loading && filtered.length === 0 && (
        <p style={{ color: INK.muted }}>Nenhuma despesa no período. Busque as despesas do Splitwise na aba Histórico.</p>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* ── 1. By category ─────────────────────────────────────────── */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 style={cardTitle}>Por categoria</h3>
                <p style={cardSub}>{measureLabel} por mês</p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={activeCategory ?? ''} onChange={e => setCategoryKey(e.target.value as CategoryKey)} style={select}>
                  {categoryOptions.map(o => (
                    <optgroup key={o.name} label={o.name}>
                      {o.parentId != null && o.items.length > 1 && <option value={`p:${o.parentId}`}>Todas de {o.name}</option>}
                      {o.items.map(i => <option key={i.id} value={`c:${i.id}`}>{i.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <MonthlyLineChart months={months} value={m => categoryByMonth.get(m) ?? 0} format={fmt} seriesLabel={measureLabel} />

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: INK.secondary, marginTop: 8 }}>
              <span>Total no período: <b style={{ color: INK.primary }}>{fmt(categoryTotal)}</b></span>
              <span>Média mensal: <b style={{ color: INK.primary }}>{fmt(months.length ? categoryTotal / months.length : 0)}</b></span>
              {comparison && (
                <span>
                  {latest} ({MONTHS_SHORT[Number(latestMonths[0].slice(5)) - 1]}–{MONTHS_SHORT[Number(latestMonths[latestMonths.length - 1].slice(5)) - 1]}):{' '}
                  <b style={{ color: INK.primary }}>{fmt(comparison.cur)}</b> vs {fmt(comparison.prev)} em {Number(latest) - 1}
                  {comparison.prev > 0 && ` (${comparison.cur >= comparison.prev ? '+' : ''}${(((comparison.cur - comparison.prev) / comparison.prev) * 100).toFixed(0)}%)`}
                </span>
              )}
            </div>
          </div>

          {/* ── 2–5 grid ───────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16 }}>
            <div style={card}>
              <h3 style={cardTitle}>Gasto total por mês</h3>
              <p style={cardSub}>{measureLabel} · média {fmt(monthlyAvg)}</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={12} {...axis} />
                  <YAxis tickFormatter={compact} width={48} {...axis} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f3f4f6' }} labelFormatter={(m: any) => formatMonth(String(m))}
                    formatter={(v: any) => [fmt(Number(v)), measureLabel]} />
                  <ReferenceLine y={monthlyAvg} stroke={INK.secondary} strokeDasharray="4 4" />
                  <Bar dataKey="value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>Ranking de categorias</h3>
              <p style={cardSub}>{measureLabel} · clique numa barra para abrir no gráfico por categoria</p>
              {hbar(ranking, (d: any) => {
                const id = d?.payload?.categoryId ?? d?.categoryId
                if (id != null) { setCategoryKey(`c:${id}`); window.scrollTo({ top: 0, behavior: 'smooth' }) }
              })}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>Gasto por grupo</h3>
              <p style={cardSub}>{measureLabel}</p>
              {hbar(groups)}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>Quem pagou</h3>
              <p style={cardSub}>Valor total pago por cada pessoa (não depende do seletor "Valor")</p>
              {hbar(payers)}
            </div>
          </div>
        </>
      )}

      {/* ── Electricity bills (RGE PDFs) ───────────────────────────────── */}
      <ElectricitySection range={range} />
    </div>
  )
}
