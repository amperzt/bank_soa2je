export type Txn = {
  date: string // ISO yyyy-mm-dd
  description: string
  amount: string // as string, will be parsed later
  currency?: string
}
