export interface Expense {
  id: string
  date: string        // YYYY-MM-DD
  description: string
  amount: number
  source?: string     // 'nubank' | 'csv' | 'manual'
  duplicate?: boolean
  duplicateOf?: string
  categoryId?: number
  receiptKey?: string // chave de acesso NF-e/NFC-e (44 dígitos)
}

export interface ReceiptItem {
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number    // valor bruto do item
  discount: number // desconto atribuído ao item na nota
  amount: number   // valor líquido, já com descontos/acréscimos rateados
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
  consumerKey: string
  consumerSecret: string
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
}

export interface CategoryRow {
  id: number
  name: string
  icon_url: string
  parent_id: number | null
}
