import { Expense, Member } from './types'

export interface SendPart {
  id: string
  date: string
  description: string
  amount: number
  groupId: number
  payerId: number
  splits: { userId: number; percent: number }[]
  categoryId?: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Soma dos itens exclusivos de cada membro (userId → valor). */
export function exclusiveTotals(expense: Expense): Map<number, number> {
  const totals = new Map<number, number>()
  for (const item of expense.receipt?.items ?? []) {
    if (item.assignee == null) continue
    totals.set(item.assignee, round2((totals.get(item.assignee) ?? 0) + item.amount))
  }
  return totals
}

/** Valor que fica para dividir no grupo: total da despesa menos os itens exclusivos. */
export function sharedAmount(expense: Expense): number {
  const exclusive = [...exclusiveTotals(expense).values()].reduce((a, b) => a + b, 0)
  return round2(expense.amount - exclusive)
}

export function partsError(expense: Expense): string | null {
  const shared = sharedAmount(expense)
  if (shared < 0) return 'Itens exclusivos somam mais que o valor da despesa.'
  const exclusive = exclusiveTotals(expense)
  if (shared === 0 && exclusive.size > 0 && [...exclusive.keys()].every(id => id === expense.payerId)) {
    return 'Todos os itens são do pagante: nada a dividir. Remova a despesa (✕) se não quiser enviá-la.'
  }
  return null
}

/**
 * Quebra uma despesa em: uma parte dividida no grupo (mantém o id original)
 * e uma despesa separada por membro com itens exclusivos (100% para ele).
 * Partes já enviadas (sentParts) são omitidas, permitindo reenvio após falha parcial.
 */
export function buildParts(
  expense: Expense & { groupId: number; payerId: number; splits: SendPart['splits'] },
  members: Member[],
): SendPart[] {
  const base = {
    date: expense.date,
    groupId: expense.groupId,
    payerId: expense.payerId,
    categoryId: expense.categoryId,
  }
  const exclusive = exclusiveTotals(expense)
  const parts: SendPart[] = []

  const shared = sharedAmount(expense)
  if (exclusive.size === 0 || shared > 0) {
    parts.push({ ...base, id: expense.id, description: expense.description, amount: shared, splits: expense.splits })
  }

  for (const [userId, amount] of exclusive) {
    // Itens exclusivos do próprio pagante não geram dívida: só saem da parte dividida
    if (userId === expense.payerId) continue
    const name = members.find(m => m.id === userId)?.firstName ?? String(userId)
    parts.push({
      ...base,
      id: `${expense.id}~${userId}`,
      description: `${expense.description} (só ${name})`,
      amount,
      splits: members.map(m => ({ userId: m.id, percent: m.id === userId ? 100 : 0 })),
    })
  }

  return parts.filter(p => !expense.sentParts?.includes(p.id))
}
