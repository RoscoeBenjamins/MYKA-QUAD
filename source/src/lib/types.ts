export type Module =
  | 'dashboard' | 'sales' | 'purchases' | 'customers' | 'products' | 'suppliers'
  | 'accounting' | 'trends' | 'forecast' | 'hygiene' | 'admin'

export type Role = 'admin' | 'manager' | 'staff' | 'viewer'

export interface User {
  id: string; username: string; name: string; email: string; role: Role; modules: Module[]
  active: string; mustChange: string; createdAt: string; lastLogin: string; twoFactor?: 'on' | 'off'
}

export interface Settings {
  companyName: string; address: string; email: string; phone: string; momo: string
  bankName: string; bankAccount: string; currency: string; vatRate: string; defaultVatStatus: string
  invPrefix: string; invYear: string; invNext: string; rctPrefix: string; rctYear: string; rctNext: string
  purPrefix: string; purNext: string; expPrefix: string; expNext: string; paymentTermsDays: string
  twoFactorPolicy: string; emailFrom: string; emailReplyTo: string; emailSenderName: string
  [k: string]: string
}

export interface Customer {
  id: string; name: string; contact: string; phone: string; email: string; address: string; type: string
  vatStatus: 'VAT' | 'Non-VAT'; tin: string; openingBalance: number; notes: string; createdAt: string; isDemo: string
}
export interface Supplier {
  id: string; name: string; products: string; contact: string; phone: string; email: string; address: string
  terms: string; notes: string; isDemo?: string
}
export interface Product {
  code: string; category: string; name: string; unit: string; supplier: string; cost: number; price: number
  vat: string; reorderLevel: number; active: string; notes: string
}
export interface Invoice {
  invoiceNo: string; date: string; customerId: string; customerName: string; vatApplied: string
  subtotal: number; vat: number; total: number; paidAtInvoice: number; payMethod: string; dueDate: string
  nextStep: string; status: string; notes: string; createdBy: string; createdAt: string; isDemo: string
  emailedAt?: string; emailedTo?: string
}
export interface InvoiceLine {
  invoiceNo: string; date: string; customerName: string; productCode: string; productName: string; unit: string
  qty: number; unitPrice: number; lineTotal: number; unitCost: number; isDemo: string
}
export interface Receipt {
  receiptNo: string; date: string; customerName: string; invoiceNo: string; amount: number; method: string
  receivedBy: string; notes: string; status: string; createdBy: string; createdAt: string; isDemo: string
  emailedAt?: string; emailedTo?: string
}
export interface Purchase {
  purchaseNo: string; date: string; supplier: string; productCode: string; productName: string; qty: number
  unitCost: number; total: number; method: string; notes: string; createdBy: string; createdAt: string; isDemo: string
}
export interface Expense {
  expenseNo: string; date: string; category: string; description: string; amount: number; method: string
  createdBy: string; createdAt: string; isDemo: string
}
export interface Account { code: string; name: string; type: string; normal: string; notes: string }
export interface JournalLine {
  entryNo: number; date: string; ref: string; acct: string; acctName: string; debit: number; credit: number
  description: string; source: string; createdBy: string; isDemo: string
}

export interface Bootstrap {
  user: User; settings: Settings; modules: Module[]; roles: Role[]; serverTime: string
  invoices?: Invoice[]; invoiceLines?: InvoiceLine[]; receipts?: Receipt[]; purchases?: Purchase[]
  expenses?: Expense[]; customers?: Customer[]; products?: Product[]; suppliers?: Supplier[]
  accounts?: Account[]; journal?: JournalLine[]
}

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard', sales: 'Sales (invoices & receipts)', purchases: 'Purchases & expenses',
  customers: 'Customers', products: 'Products & pricing', suppliers: 'Suppliers', accounting: 'Accounting',
  trends: 'Trend analysis', forecast: 'Forecast', hygiene: 'Data hygiene KPIs', admin: 'Admin portal',
}

export const PAY_METHODS = ['Cash', 'MoMo', 'Bank Transfer', 'Cheque'] as const

export type LoginResult =
  | { token: string; user: User; recoveryCodes?: string[]; recoveryLeft?: number; mfa?: undefined }
  | { mfa: 'verify'; challenge: string }
  | { mfa: 'enroll'; challenge: string; secret: string; otpauth: string }
