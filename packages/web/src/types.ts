export interface CsvMapping { date: string; desc: string; amount: string; key?: string }
export interface CsvColumnInfo {
  headers: string[]
  sample: string[][]
  suggested: CsvMapping
}

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
  categoryId?: number
  receiptKey?: string    // chave de acesso NF-e/NFC-e (44 dígitos)
  receipt?: Receipt
  sentParts?: string[]   // ids das partes (compartilhada/exclusivas) já enviadas
}

export interface ReceiptItem {
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  discount: number
  amount: number      // valor líquido
  assignee?: number   // userId de quem paga sozinho; vazio = dividido no grupo
}

export interface Receipt {
  accessKey: string
  model: string       // '55' NF-e | '65' NFC-e
  issuer: string
  total: number
  items: ReceiptItem[]
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
  category_id: number | null
  sent_at: string
}

export interface SendResult {
  id: string
  ok: boolean
  splitwiseId?: number
  error?: string
}

export interface SplitwiseExpenseInfo {
  id: number
  date: string       // YYYY-MM-DD
  description: string
  amount: number
}

export interface SplitwiseExpenseSplit {
  name: string
  owedShare: number
  owedPercent: number
}

export interface SplitwiseImportRow {
  id: number
  date: string
  description: string
  amount: number
  payer_name: string
  splits: string   // JSON string: SplitwiseExpenseSplit[]
  category_id: number | null
  category_name: string
  imported_at: string
}

export interface Category {
  id: number
  name: string
  icon_url: string
  parent_id: number | null
}
