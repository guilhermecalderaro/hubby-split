import { Expense } from '../../types'

export interface ParserPlugin {
  name: string
  detect?: (text: string) => boolean
  parse(input: Buffer): Promise<Expense[]>
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
