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
  receiptKey?: string    // NF-e/NFC-e access key (44 digits)
  receipt?: Receipt
  sentParts?: string[]   // ids of parts (shared/exclusive) already sent
}

export interface ReceiptItem {
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  discount: number
  amount: number      // net amount
  assignee?: number   // userId of the member who pays alone; empty = split across the group
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
  group_id: number | null  // null = synced before groups were tracked; 0 = non-group expense
  group_name: string
  currency_code: string  // '' = synced before currency was tracked
  imported_at: string
}

export interface Category {
  id: number
  name: string
  icon_url: string
  parent_id: number | null
}

// ── Electricity bills (RGE PDFs) ─────────────────────────────────────────────

export interface FlagDays { verde: number; amarela: number; vermelha1: number; vermelha2: number }

export interface ElectricityBillItem {
  kind: 'tusd' | 'te' | 'flag' | 'adjustment' | 'cip' | 'other' | 'credit'
  label: string
  amount: number     // credits are negative
}

export interface ElectricityBill {
  refMonth: string           // YYYY-MM (month the reading ends)
  dueDate: string            // YYYY-MM-DD
  readingFrom: string | null // YYYY-MM-DD
  readingTo: string | null
  days: number | null
  kwh: number
  total: number              // amount due
  distributorTotal: number
  tusdAmount: number
  teAmount: number
  flagCharge: number         // tariff flag surcharge (all colors)
  cip: number                // public lighting fee
  adjustments: number        // other positive charges
  credits: number            // negative
  tusdRate: number           // R$/kWh without taxes
  tusdRateTax: number        // R$/kWh with taxes
  teRate: number
  teRateTax: number
  flagDays: FlagDays
  items: ElectricityBillItem[]
  status: 'ok' | 'review'
  notes: string[]
}
