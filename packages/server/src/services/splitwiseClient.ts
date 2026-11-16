import { Group, Member, ExpenseSubmit, SplitwiseExpenseInfo, CategoryRow } from '../types'
import { readSettings } from './settings'

const BASE = 'https://secure.splitwise.com/api/v3.0'

function headers() {
  const { apiKey } = readSettings()
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

async function ensureOk(res: Response) {
  if (res.ok) return
  let detail = ''
  try {
    const data = await res.json() as { errors?: Record<string, string[] | string>; error?: string }
    detail = data.error ?? Object.values(data.errors ?? {}).flat().join(' ')
  } catch {}
  throw new Error(`Splitwise API error: ${res.status}${detail ? ` - ${detail}` : ''}`)
}

export async function getGroups(): Promise<Group[]> {
  const res = await fetch(`${BASE}/get_groups`, { headers: headers() })
  await ensureOk(res)
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

export interface GetExpensesParams {
  dated_after?: string
  dated_before?: string
  group_id?: number
}

export interface GetExpensesResult {
  expenses: SplitwiseExpenseInfo[]
  // Deleted expenses and payments (settle-ups): never stored, and removed if already stored
  removedIds: number[]
}

export async function getExpenses(params: GetExpensesParams): Promise<GetExpensesResult> {
  const all: SplitwiseExpenseInfo[] = []
  const removedIds: number[] = []
  const limit = 100
  let offset = 0

  while (true) {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (params.dated_after)  qs.set('dated_after',  params.dated_after)
    if (params.dated_before) qs.set('dated_before', params.dated_before)
    if (params.group_id !== undefined) qs.set('group_id', String(params.group_id))

    const res = await fetch(`${BASE}/get_expenses?${qs}`, { headers: headers() })
    await ensureOk(res)
    const data = await res.json() as { expenses: any[] }

    const raw: any[] = data.expenses ?? []
    for (const e of raw) if (e.deleted_at || e.payment) removedIds.push(e.id)

    const page: SplitwiseExpenseInfo[] = raw
      .filter(e => !e.deleted_at && !e.payment)
      .map(e => {
        const cost = parseFloat(e.cost ?? '0')
        const users: any[] = e.users ?? []
        const payer = users.find(u => parseFloat(u.paid_share ?? '0') > 0)
        const payerName = payer
          ? `${payer.user?.first_name ?? ''} ${payer.user?.last_name ?? ''}`.trim()
          : ''
        const splits = users.map(u => {
          const owedShare = parseFloat(u.owed_share ?? '0')
          return {
            name: `${u.user?.first_name ?? ''} ${u.user?.last_name ?? ''}`.trim(),
            owedShare,
            owedPercent: cost > 0 ? Math.round((owedShare / cost) * 100) : 0,
          }
        })
        return {
          id: e.id,
          date: (e.date ?? '').slice(0, 10),
          description: e.description ?? '',
          amount: cost,
          payerName,
          splits,
          categoryId: e.category?.id ?? undefined,
          categoryName: e.category?.name ?? '',
          groupId: e.group_id ?? 0,
          userIds: users.map(u => u.user?.id ?? u.user_id),
          currencyCode: e.currency_code ?? '',
        }
      })

    all.push(...page)
    if (raw.length < limit) break
    offset += limit
  }

  return { expenses: all, removedIds }
}

export async function getCurrentUserId(): Promise<number> {
  const res = await fetch(`${BASE}/get_current_user`, { headers: headers() })
  await ensureOk(res)
  const data = await res.json() as { user: { id: number } }
  return data.user.id
}

// All groups the user belongs to, without filtering out "non-group expenses" (id 0)
export async function getGroupNames(): Promise<Map<number, string>> {
  const res = await fetch(`${BASE}/get_groups`, { headers: headers() })
  await ensureOk(res)
  const data = await res.json() as { groups: { id: number; name: string }[] }
  return new Map(data.groups.map(g => [g.id, g.name]))
}

export async function getCategories(): Promise<CategoryRow[]> {
  const res = await fetch(`${BASE}/get_categories`, { headers: headers() })
  await ensureOk(res)
  const data = await res.json() as { categories: any[] }

  const result: CategoryRow[] = []
  for (const cat of data.categories ?? []) {
    result.push({ id: cat.id, name: cat.name, icon_url: cat.icon ?? '', parent_id: null })
    for (const sub of cat.subcategories ?? []) {
      result.push({ id: sub.id, name: sub.name, icon_url: sub.icon ?? '', parent_id: cat.id })
    }
  }
  return result
}

export async function createExpense(expense: ExpenseSubmit, groupName: string, payerName: string): Promise<number> {
  const total = expense.amount
  const users = expense.splits.map(s => ({
    user_id: s.userId,
    paid_shares: s.userId === expense.payerId ? total.toFixed(2) : '0.00',
    owed_shares: ((total * s.percent) / 100).toFixed(2),
  }))

  // Cent adjustment: give the remainder to the first user
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
  if (expense.categoryId) body.category_id = String(expense.categoryId)
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
  await ensureOk(res)
  const data = await res.json() as { expenses?: any[]; errors?: any }
  if (data.errors && Object.keys(data.errors).length > 0) throw new Error(JSON.stringify(data.errors))
  if (!data.expenses?.length) throw new Error('No expense returned from Splitwise')
  return data.expenses[0].id
}
