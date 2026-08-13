import { Group, Member, ExpenseSubmit } from '../types'
import { readSettings } from './settings'

const BASE = 'https://secure.splitwise.com/api/v3.0'

function headers() {
  const { apiKey } = readSettings()
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

export async function getGroups(): Promise<Group[]> {
  const res = await fetch(`${BASE}/get_groups`, { headers: headers() })
  if (!res.ok) throw new Error(`Splitwise API error: ${res.status}`)
  const data = await res.json() as { groups: any[] }

  return data.groups
    .filter(g => g.id !== 0)
    .map(g => ({
      id: g.id,
      name: g.name,
      members: (g.members as any[]).map((m): Member => ({
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
      })),
    }))
}

export async function createExpense(expense: ExpenseSubmit, groupName: string, payerName: string): Promise<number> {
  const total = expense.amount
  const users = expense.splits.map(s => ({
    user_id: s.userId,
    paid_shares: s.userId === expense.payerId ? total.toFixed(2) : '0.00',
    owed_shares: ((total * s.percent) / 100).toFixed(2),
  }))

  // Ajuste de centavos: distribuir resto no primeiro usuário
  const owedSum = users.reduce((acc, u) => acc + parseFloat(u.owed_shares), 0)
  const diff = parseFloat((total - owedSum).toFixed(2))
  if (diff !== 0) {
    users[0].owed_shares = (parseFloat(users[0].owed_shares) + diff).toFixed(2)
  }

  const body: Record<string, string> = {
    cost: total.toFixed(2),
    description: expense.description,
    group_id: String(expense.groupId),
    currency_code: 'BRL',
    date: expense.date,
  }
  users.forEach((u, i) => {
    body[`users__${i}__user_id`] = String(u.user_id)
    body[`users__${i}__paid_share`] = u.paid_shares
    body[`users__${i}__owed_share`] = u.owed_shares
  })

  const res = await fetch(`${BASE}/create_expense`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Splitwise API error: ${res.status}`)
  const data = await res.json() as { expenses?: any[]; errors?: any }
  if (data.errors && Object.keys(data.errors).length > 0) throw new Error(JSON.stringify(data.errors))
  if (!data.expenses?.length) throw new Error('No expense returned from Splitwise')
  return data.expenses[0].id
}
