// "Conta de luz" section of the Dashboard: RGE bill import and charts.
import { useEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { MonthlyLineChart } from '../components/MonthlyLineChart'
import { ElectricityBill } from '../types'
import { brl, formatDate, formatMonth } from '../format'
import { linearTrend, mean, monthsBetween, seasonBands, seasonOf } from './aggregate'
import {
  GUIDE_STROKE, Guide, GuideToggle, INK, SERIES, SeasonLegend, axis, card, cardSub, cardTitle, endLabel, indexAxis,
  perYear, seasonAreas, tooltipStyle,
} from './chartTheme'
import { COMPOSITION, FLAGS, composition, effectiveRate, flagShares, kwhPerDay, recentVsPrevious } from './electricity'

interface UploadResult { file: string; ref: string | null; status: 'ok' | 'review' | 'error'; notes: string[] }

const perKwh = (n: number) => `R$ ${n.toFixed(3).replace('.', ',')}/kWh`
const kwhDay = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh/dia`
const pct = (cur: number | null, prev: number | null) =>
  cur != null && prev ? ` (${cur >= prev ? '+' : ''}${(((cur - prev) / prev) * 100).toFixed(0)}% vs 12 contas anteriores)` : ''

export function ElectricitySection({ range }: { range: { from: string; to: string } }) {
  const [bills, setBills] = useState<ElectricityBill[]>([])
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [rateGuide, setRateGuide] = useState<Guide>('trend')
  const input = useRef<HTMLInputElement>(null)

  function load() {
    fetch(`/api/electricity/bills?${new URLSearchParams({ from: range.from.slice(0, 7), to: range.to.slice(0, 7) })}`)
      .then(r => r.json())
      .then(d => setBills(Array.isArray(d) ? d : []))
      .finally(() => setLoaded(true))
  }
  useEffect(load, [range.from, range.to])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    const form = new FormData()
    for (const f of Array.from(files)) form.append('files', f)
    try {
      const res = await fetch('/api/electricity/bills', { method: 'POST', body: form }).then(r => r.json())
      setResults(Array.isArray(res) ? res : [{ file: '', ref: null, status: 'error', notes: [res.error ?? 'Erro ao importar.'] }])
      load()
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const byMonth = new Map(bills.map(b => [b.refMonth, b]))
  const months = bills.length ? monthsBetween(bills[0].refMonth, bills[bills.length - 1].refMonth) : []
  const summary = recentVsPrevious(bills)

  const rateData = months.map((m, i) => {
    const b = byMonth.get(m)
    return { i, efetivo: b ? effectiveRate(b) : null, tusd: b?.tusdRateTax ?? null, te: b?.teRateTax ?? null }
  })
  // Average / trend of the effective price
  const rateTrend = linearTrend(rateData.map(d => d.efetivo))
  const rateAvg = mean(rateData.map(d => d.efetivo))
  const rateChart = rateData.map((d, i) => ({ ...d, tendencia: rateTrend?.fitted[i] ?? null }))
  const rateSeries = [
    { key: 'efetivo', label: 'Efetivo (energia + bandeira)', color: SERIES[0] },
    { key: 'tusd', label: 'TUSD c/ impostos', color: SERIES[1] },
    { key: 'te', label: 'TE c/ impostos', color: SERIES[2] },
  ]
  const compData = bills.map(composition)
  const flagData = bills.map(flagShares)
  // Kept apart from the flag colors below (no yellow/green): energy, flag, public lighting, adjustments, credits
  const bandColors = [SERIES[0], SERIES[1], SERIES[6], SERIES[4], INK.muted]

  const importButton = (
    <>
      <input ref={input} type="file" accept="application/pdf" multiple style={{ display: 'none' }}
        onChange={e => upload(e.target.files)} />
      <button onClick={() => input.current?.click()} disabled={uploading}
        style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px',
          fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
        {uploading ? 'Importando...' : 'Importar faturas (PDF)'}
      </button>
    </>
  )

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Conta de luz</h2>
        {importButton}
      </div>
      <p style={{ ...cardSub, marginBottom: 12 }}>
        Faturas da RGE importadas em PDF, pelo mês de referência (mês em que termina a leitura). Usa só o filtro de período.
      </p>

      {results.length > 0 && (
        <div style={{ ...card, marginBottom: 16, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <b>{results.filter(r => r.status !== 'error').length} de {results.length} fatura(s) importada(s)</b>
            <button onClick={() => setResults([])} style={{ border: 'none', background: 'none', cursor: 'pointer', color: INK.muted }}>✕</button>
          </div>
          {results.filter(r => r.status !== 'ok' || r.notes.length).map((r, i) => (
            <div key={i} style={{ color: r.status === 'error' ? '#b91c1c' : r.status === 'review' ? '#92400e' : INK.secondary }}>
              {r.ref ? formatMonth(r.ref) : r.file} — {r.status === 'error' ? 'erro' : r.status === 'review' ? 'revisar' : 'ok'}: {r.notes.join(' ')}
            </div>
          ))}
        </div>
      )}

      {loaded && bills.length === 0 && (
        <div style={{ ...card, fontSize: 13, color: INK.secondary }}>
          Nenhuma fatura no período. Baixe as faturas em PDF no site ou app da RGE (Histórico de faturas → 2ª via) e importe aqui.
          Pode enviar várias de uma vez; reenviar o mesmo mês só atualiza os dados.
        </div>
      )}

      {bills.length > 0 && (
        <>
          {/* ── Consumption ─────────────────────────────────────────────── */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={cardTitle}>Consumo</h3>
            <p style={cardSub}>
              kWh por dia de leitura · média das últimas {summary.months} contas:{' '}
              <b style={{ color: INK.primary }}>{summary.kwhDay != null ? kwhDay(summary.kwhDay) : '—'}</b>
              {pct(summary.kwhDay, summary.kwhDayPrev)}
            </p>
            <MonthlyLineChart months={months} format={kwhDay} seriesLabel="Consumo" yTick={n => String(Math.round(n))}
              value={m => { const b = byMonth.get(m); return b ? kwhPerDay(b) : null }}
              detail={m => {
                const b = byMonth.get(m)
                return b ? `${b.kwh} kWh em ${b.days} dias${b.readingFrom && b.readingTo
                  ? `, ${formatDate(b.readingFrom).slice(0, 5)}–${formatDate(b.readingTo).slice(0, 5)}` : ''}` : null
              }} />
          </div>

          {/* ── Price per kWh ───────────────────────────────────────────── */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={cardTitle}>Preço do kWh</h3>
            <p style={cardSub}>
              Com impostos · efetivo médio das últimas {summary.months} contas:{' '}
              <b style={{ color: INK.primary }}>{summary.rate != null ? perKwh(summary.rate) : '—'}</b>
              {pct(summary.rate, summary.ratePrev)}
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 8px' }}>
              <GuideToggle value={rateGuide} onChange={setRateGuide} />
              {rateGuide === 'trend' && rateTrend && (
                <span style={{ fontSize: 12, color: INK.secondary }}>Tendência do efetivo: <b>{perYear(rateTrend.slope, perKwh)}</b></span>
              )}
              {rateGuide === 'avg' && rateAvg != null && (
                <span style={{ fontSize: 12, color: INK.secondary }}>Média do efetivo no período: <b>{perKwh(rateAvg)}</b></span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rateChart} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
                {seasonAreas(seasonBands(months.map(m => Number(m.slice(5, 7)))), months.length <= 24)}
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis {...indexAxis(months.length, i => formatMonth(months[i]))} {...axis} />
                <YAxis width={48} {...axis} tickFormatter={(n: number) => n.toFixed(2).replace('.', ',')} domain={['auto', 'auto']} />
                <Tooltip {...tooltipStyle}
                  labelFormatter={(i: any) => months[Number(i)] ? `${formatMonth(months[Number(i)])} · ${seasonOf(Number(months[Number(i)].slice(5, 7)))}` : ''}
                  formatter={(v: any, name: any) => [perKwh(Number(v)), String(name)]} />
                <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                {rateSeries.map(s => (
                  <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
                    dot={months.length <= 36 ? { r: 3, strokeWidth: 0, fill: s.color } : false}
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false}
                    label={endLabel(rateData, s.key, s.key === 'efetivo' ? 'Efetivo' : s.key.toUpperCase())} />
                ))}
                {rateGuide === 'trend' && rateTrend && (
                  <Line type="linear" dataKey="tendencia" name="Tendência do efetivo" {...GUIDE_STROKE} dot={false}
                    activeDot={false} connectNulls={false} isAnimationActive={false} legendType="plainline" />
                )}
                {rateGuide === 'avg' && rateAvg != null && (
                  <ReferenceLine y={rateAvg} {...GUIDE_STROKE} ifOverflow="extendDomain"
                    label={{ value: 'média do efetivo', position: 'insideBottomLeft', fontSize: 11, fill: INK.secondary }} />
                )}
              </LineChart>
            </ResponsiveContainer>
            <SeasonLegend />
          </div>

          {/* ── Composition and tariff flags ────────────────────────────── */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={cardTitle}>Composição e bandeiras</h3>
            <p style={cardSub}>O que compõe cada conta (créditos ficam abaixo de zero) e os dias sob cada bandeira tarifária</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={compData} stackOffset="sign" margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={3}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="month" tickFormatter={formatMonth} minTickGap={12} {...axis} />
                <YAxis width={48} {...axis} tickFormatter={(n: number) => String(Math.round(n))} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f3f4f6' }}
                  labelFormatter={(m: any) => {
                    const b = byMonth.get(String(m))
                    return `${formatMonth(String(m))} · total ${b ? brl(b.total) : ''}`
                  }}
                  formatter={(v: any, name: any) => Number(v) === 0 ? [null, null] as any : [brl(Number(v)), String(name)]} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                <ReferenceLine y={0} stroke={INK.secondary} />
                {COMPOSITION.map((c, i) => (
                  <Bar key={c.key} dataKey={c.key} name={c.label} stackId="a" fill={bandColors[i]}
                    stroke="#fff" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Flag days strip, aligned with the bars above (same margins and axis width) */}
            <ResponsiveContainer width="100%" height={86}>
              <BarChart data={flagData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={3}>
                <XAxis dataKey="month" tick={false} height={4} stroke={INK.grid} />
                <YAxis width={48} domain={[0, 100]} ticks={[]} {...axis} label={{ value: 'Bandeira', angle: -90, fontSize: 10, fill: INK.muted, dx: 4 }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#f3f4f6' }} labelFormatter={(m: any) => formatMonth(String(m))}
                  formatter={(_v: any, name: any, item: any) => {
                    const f = FLAGS.find(x => x.label === name)
                    const days = f ? item?.payload?.days?.[f.key] : 0
                    return days ? [`${days} dias`, String(name)] : [null, null] as any
                  }} />
                {FLAGS.map(f => (
                  <Bar key={f.key} dataKey={f.key} name={f.label} stackId="f" fill={f.color}
                    stroke="#fff" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: INK.secondary, margin: '4px 0 0 52px', flexWrap: 'wrap' }}>
              {FLAGS.map(f => (
                <span key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: f.color }} />Bandeira {f.label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

