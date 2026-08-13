import { Member } from '../types'

interface Props {
  members: Member[]
  splits: { userId: number; percent: number }[]
  onChange: (splits: { userId: number; percent: number }[]) => void
}

export function SplitInput({ members, splits, onChange }: Props) {
  if (members.length !== 2) return null

  const [a, b] = splits.length === 2 ? splits : members.map(m => ({ userId: m.id, percent: 50 }))

  function handleChange(index: number, value: number) {
    const clamped = Math.min(100, Math.max(0, value))
    if (index === 0) {
      onChange([{ userId: a.userId, percent: clamped }, { userId: b.userId, percent: 100 - clamped }])
    } else {
      onChange([{ userId: a.userId, percent: 100 - clamped }, { userId: b.userId, percent: clamped }])
    }
  }

  const nameA = members.find(m => m.id === a.userId)?.firstName ?? String(a.userId)
  const nameB = members.find(m => m.id === b.userId)?.firstName ?? String(b.userId)

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
      <span style={{ width: 52, color: '#888' }}>{nameA}</span>
      <input
        type="number" min={0} max={100} value={a.percent}
        onChange={e => handleChange(0, Number(e.target.value))}
        style={{ width: 48, textAlign: 'center' }}
      />
      <span style={{ color: '#aaa' }}>↔</span>
      <input
        type="number" min={0} max={100} value={b.percent}
        onChange={e => handleChange(1, Number(e.target.value))}
        style={{ width: 48, textAlign: 'center' }}
      />
      <span style={{ width: 52, color: '#888' }}>{nameB}</span>
    </div>
  )
}
