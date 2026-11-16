// One value per month, as a timeline or with years overlaid (Jan–Dec), over season bands.
import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts'
import { MONTHS_SHORT, formatMonth } from '../format'
import { linearTrend, mean, seasonBands, seasonOf } from '../dashboard/aggregate'
import {
  GUIDE_STROKE, Guide, GuideToggle, INK, SERIES, Segmented, SeasonLegend, axis, compact, endLabel, indexAxis, perYear,
  seasonAreas, tooltipStyle,
} from '../dashboard/chartTheme'

const MAX_OVERLAY_YEARS = SERIES.length

interface Props {
  months: string[]                              // 'YYYY-MM', ascending
  value: (month: string) => number | null       // null = no data (gap)
  format: (n: number) => string
  seriesLabel: string
  detail?: (month: string) => string | null     // extra tooltip line
  yTick?: (n: number) => string
  height?: number
}

export function MonthlyLineChart({ months, value, format, seriesLabel, detail, yTick = compact, height = 320 }: Props) {
  const [view, setView] = useState<'linear' | 'overlay'>('overlay')
  const [hiddenYears, setHiddenYears] = useState<Set<string>>(new Set())
  const [guide, setGuide] = useState<Guide>('trend')

  const years = [...new Set(months.map(m => m.slice(0, 4)))].sort().reverse()
  // The toggle only makes sense past one year of months
  const multiYear = months.length > 12 && years.length > 1
  const hasData = (v: number | null) => v != null && v !== 0

  // Only years with data; most recent first, capped at the palette size. Color follows the year.
  const yearsWithData = years.filter(y => months.some(m => m.startsWith(y) && hasData(value(m))))
  const overlayYears = yearsWithData.slice(0, MAX_OVERLAY_YEARS)
  const colorOf = (y: string) => SERIES[overlayYears.indexOf(y)]
  const shownYears = overlayYears.filter(y => !hiddenYears.has(y))

  const monthSet = new Set(months)
  const overlayData = MONTHS_SHORT.map((_, i) => {
    const point: Record<string, number | null> = { i }
    for (const y of shownYears) {
      const ym = `${y}-${String(i + 1).padStart(2, '0')}`
      point[y] = monthSet.has(ym) ? value(ym) : null   // months outside the period are gaps
    }
    return point
  })
  const linearValues = months.map(m => value(m))
  const trend = linearTrend(linearValues)
  const average = mean(linearValues)
  const linearData = months.map((_, i) => ({ i, value: linearValues[i], trend: trend?.fitted[i] ?? null }))

  // Overlaid years: the guide is the month-by-month average of the years shown
  const overlay = multiYear && view === 'overlay'
  if (overlay && guide !== 'none') {
    for (const p of overlayData) p.media = mean(shownYears.map(y => p[y]))
  }

  const toggleYear = (y: string) =>
    setHiddenYears(prev => { const n = new Set(prev); if (n.has(y)) n.delete(y); else n.add(y); return n })

  const tooltipLabel = (month: string | undefined) => {
    if (!month) return ''
    const extra = detail?.(month)
    return `${formatMonth(month)} · ${seasonOf(Number(month.slice(5, 7)))}${extra ? ` · ${extra}` : ''}`
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 8px' }}>
        {multiYear && (
          <Segmented value={view} onChange={setView}
            options={[{ value: 'linear', label: 'Linear' }, { value: 'overlay', label: 'Anos sobrepostos' }]} />
        )}
        <GuideToggle value={overlay && guide === 'trend' ? 'avg' : guide} onChange={setGuide}
          trend={!overlay} avgLabel={overlay ? 'Média dos anos' : 'Média'} />
        {!overlay && guide === 'trend' && trend && (
          <span style={{ fontSize: 12, color: INK.secondary }}>Tendência: <b>{perYear(trend.slope, format)}</b></span>
        )}
        {!overlay && guide === 'avg' && average != null && (
          <span style={{ fontSize: 12, color: INK.secondary }}>Média: <b>{format(average)}</b></span>
        )}
      </div>
      {multiYear && view === 'overlay' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 8px' }}>
          {view === 'overlay' && overlayYears.map(y => {
            const on = !hiddenYears.has(y)
            return (
              <button key={y} onClick={() => toggleYear(y)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 10px',
                  borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
                  color: on ? INK.primary : INK.muted }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: on ? colorOf(y) : '#d1d5db' }} />
                {y}
              </button>
            )
          })}
          {view === 'overlay' && yearsWithData.length > MAX_OVERLAY_YEARS && (
            <span style={{ fontSize: 12, color: INK.muted }}>Mostrando os {MAX_OVERLAY_YEARS} anos mais recentes</span>
          )}
        </div>
      )}

      {multiYear && view === 'overlay' ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={overlayData} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
            {seasonAreas(seasonBands(MONTHS_SHORT.map((_, i) => i + 1)), true)}
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis {...indexAxis(12, i => MONTHS_SHORT[i])} {...axis} />
            <YAxis tickFormatter={yTick} width={48} {...axis} />
            <Tooltip {...tooltipStyle} labelFormatter={(i: any) => `${MONTHS_SHORT[Number(i)]} · ${seasonOf(Number(i) + 1)}`}
              formatter={(v: any, name: any, item: any) => {
                const extra = detail?.(`${name}-${String(Number(item?.payload?.i) + 1).padStart(2, '0')}`)
                return [`${format(Number(v))}${extra ? ` (${extra})` : ''}`, String(name)]
              }}
              itemSorter={(item: any) => -Number(item.dataKey)} />
            <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
            {[...shownYears].reverse().map(y => (
              <Line key={y} type="linear" dataKey={y} name={y} stroke={colorOf(y)} strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: colorOf(y) }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                connectNulls={false} isAnimationActive={false} label={endLabel(overlayData, y, y)} />
            ))}
            {guide !== 'none' && shownYears.length > 1 && (
              <Line type="linear" dataKey="media" name="Média dos anos" {...GUIDE_STROKE} dot={false}
                activeDot={false} connectNulls isAnimationActive={false} legendType="plainline" />
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={linearData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            {seasonAreas(seasonBands(months.map(m => Number(m.slice(5, 7)))), months.length <= 24)}
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis {...indexAxis(months.length, i => formatMonth(months[i]))} {...axis} />
            <YAxis tickFormatter={yTick} width={48} {...axis} />
            <Tooltip {...tooltipStyle} labelFormatter={(i: any) => tooltipLabel(months[Number(i)])}
              formatter={(v: any, name: any) => [format(Number(v)), name === 'Tendência' ? 'Tendência' : seriesLabel]} />
            <Line type="linear" dataKey="value" stroke={SERIES[0]} strokeWidth={2} connectNulls={false}
              dot={months.length <= 36 ? { r: 3, strokeWidth: 0, fill: SERIES[0] } : false}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            {guide === 'trend' && trend && (
              <Line type="linear" dataKey="trend" name="Tendência" {...GUIDE_STROKE} dot={false} activeDot={false}
                connectNulls={false} isAnimationActive={false} />
            )}
            {guide === 'avg' && average != null && (
              <ReferenceLine y={average} {...GUIDE_STROKE} ifOverflow="extendDomain"
                label={{ value: 'média', position: 'insideTopRight', fontSize: 11, fill: INK.secondary }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
      <SeasonLegend />
    </>
  )
}
