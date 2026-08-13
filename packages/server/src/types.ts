export interface Expense {
  id: string
  date: string        // YYYY-MM-DD
  description: string
  amount: number
  source?: string     // 'nubank' | 'csv' | 'manual'
  duplicate?: boolean
  duplicateOf?: string
}

export interface ExpenseSubmit extends Expense {
  groupId: number
  payerId: number
  splits: { userId: number; percent: number }[]
}

export interface SentExpense extends ExpenseSubmit {
  splitwiseId: number
  sentAt: string
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

export interface Settings {
  apiKey: string
  consumerKey: string
  consumerSecret: string
  activeGroupIds: number[]
}
