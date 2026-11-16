// Shared chart styling and building blocks for the Dashboard.
import React from 'react'
import { ReferenceArea } from 'recharts'
import { Season, seasonBands } from './aggregate'

// Reference categorical palette (dataviz skill), fixed order; slot follows the entity, never its rank
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#8a8984', grid: '#e7e6e2' }

// Season backgrounds: barely-there tints so they read as context, not data
export const SEASON_FILL: Record<Season, string> = {
  'Verão': '#f5b400', 'Outono': '#e8743b', 'Inverno': '#5b9be6', 'Primavera': '#3fb27f',
}
const SEASON_OPACITY = 0.09

export function seasonAreas(bands: ReturnType<typeof seasonBands>, withLabels: boolean) {
  return bands.map(b => (
    <ReferenceArea key={`${b.season}-${b.start}`} x1={b.start - 0.5} x2={b.end + 0.5} ifOverflow="hidden"
      fill={SEASON_FILL[b.season]} fillOpacity={SEASON_OPACITY} strokeOpacity={0}
      label={withLabels && b.end > b.start
        ? { value: b.season, position: 'insideTop', fontSize: 10, fill: INK.muted, offset: 6 } : undefined} />
  ))
}

export function SeasonLegend() {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: INK.muted, margin: '2px 0 0 52px' }}>
      {(Object.keys(SEASON_FILL) as Season[]).map(s => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: SEASON_FILL[s], opacity: 0.5 }} />{s}
        </span>
      ))}
    </div>
  )
}

/** Numeric x axis over row indexes, so season bands can cover whole months (-0.5 … n-0.5). */
export function indexAxis(n: number, label: (i: number) => string) {
  const step = Math.max(1, Math.ceil(n / 12))
  return {
    type: 'number' as const, dataKey: 'i', domain: [-0.5, n - 0.5], allowDecimals: false,
    ticks: Array.from({ length: n }, (_, i) => i).filter(i => i % step === 0),
    tickFormatter: (i: number) => label(i) ?? '',
  }
}

export const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))

export const axis = { tick: { fontSize: 11, fill: INK.secondary }, stroke: INK.grid }
export const tooltipStyle = { contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' } }

export const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px' }
export const cardTitle: React.CSSProperties = { margin: '0 0 2px', fontSize: 15, color: INK.primary }
export const cardSub: React.CSSProperties = { margin: '0 0 12px', fontSize: 12, color: INK.secondary }
export const selectStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }

/** Direct label at the last non-null point of a line (light hues are low-contrast, so text carries identity). */
export function endLabel(data: Record<string, unknown>[], key: string, text: string) {
  const lastIdx = data.reduce((last: number, d, i) => d[key] != null ? i : last, -1)
  return (p: any) => p.index !== lastIdx || p.value == null ? null
    : <text x={p.x + 6} y={p.y + 4} fontSize={11} fontWeight={600} fill={INK.secondary}>{text}</text>
}

// Reference lines (average / trend): dashed, in text ink, so they never read as another series
export type Guide = 'none' | 'avg' | 'trend'
export const GUIDE_STROKE = { stroke: INK.secondary, strokeWidth: 1.5, strokeDasharray: '5 4' }

export function GuideToggle({ value, onChange, trend = true, avgLabel = 'Média' }: {
  value: Guide; onChange: (g: Guide) => void; trend?: boolean; avgLabel?: string
}) {
  const options: { value: Guide; label: string }[] = [{ value: 'none', label: 'Sem linha' }, { value: 'avg', label: avgLabel }]
  if (trend) options.push({ value: 'trend', label: 'Tendência' })
  return <Segmented value={value} onChange={onChange} options={options} />
}

/** "+R$ 12,30/ano" from a per-month slope. */
export const perYear = (slopePerMonth: number, format: (n: number) => string) =>
  `${slopePerMonth >= 0 ? '+' : '−'}${format(Math.abs(slopePerMonth * 12))}/ano`

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{ padding: '5px 12px', fontSize: 13, border: 'none', cursor: 'pointer',
            background: value === o.value ? '#4f46e5' : '#fff', color: value === o.value ? '#fff' : INK.primary }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
