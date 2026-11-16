export interface Expense {
  id: string
  date: string        // YYYY-MM-DD
  description: string
  amount: number
  source?: string     // 'nubank' | 'csv' | 'manual'
  duplicate?: boolean
  duplicateOf?: string
  categoryId?: number
  receiptKey?: string // NF-e/NFC-e access key (44 digits)
}

export interface ReceiptItem {
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number    // gross item amount
  discount: number // discount assigned to the item on the receipt
  amount: number   // net amount, with discounts/surcharges already prorated
}

export interface Receipt {
  accessKey: string
  model: string    // '55' NF-e | '65' NFC-e
  issuer: string
  total: number
  items: ReceiptItem[]
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
  syncExcludedGroupIds: number[] // groups never pulled by the History sync (0 = non-group)
  activeGroupIds: number[]
}

export interface SplitwiseExpenseSplit {
  name: string
  owedShare: number
  owedPercent: number
}

export interface SplitwiseExpenseInfo {
  id: number
  date: string       // YYYY-MM-DD
  description: string
  amount: number
  payerName: string
  splits: SplitwiseExpenseSplit[]
  categoryId?: number
  categoryName?: string
  groupId: number    // 0 = non-group expense
  userIds: number[]  // same order as splits
}

// Pseudo-group id used in settings for Splitwise's "non-group expenses"
export const NON_GROUP_ID = 0

export interface CategoryRow {
  id: number
  name: string
  icon_url: string
  parent_id: number | null
}
