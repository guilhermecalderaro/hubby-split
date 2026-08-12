export interface NubankSection {
  name: string
  total: number
  expenses: Expense[]
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  source?: string
  duplicate?: boolean
  duplicateOf?: string
  // set by user before sending
  groupId?: number
  payerId?: number
  splits?: { userId: number; percent: number }[]
}

export interface Group {
  id: number
  name: string
  members: Member[]
}

export interface Member {
  id: number
  firstName: string
  lastName: string
}

export interface SentExpense {
  id: string
  date: string
  description: string
  amount: number
  group_name: string
  payer_name: string
  splitwise_id: number
  sent_at: string
}

export interface SendResult {
  id: string
  ok: boolean
  splitwiseId?: number
  error?: string
}
