import type { Account, Customer, Expense, Invoice, InvoiceLine, JournalLine, Product, Purchase, Receipt, Supplier } from './types'
import { addMonths, daysBetween, todayISO } from './fmt'

const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- invoices
export interface InvoiceState extends Invoice {
  received: number; outstanding: number; payStatus: 'PAID' | 'PARTIAL' | 'UNPAID' | 'VOID'
  daysOverdue: number; lastActivity: string; age: number
}

export function invoiceStates(invoices: Invoice[] = [], receipts: Receipt[] = [], today = todayISO()): InvoiceState[] {
  const byInv = new Map<string, Receipt[]>()
  receipts.filter(r => r.status !== 'VOID').forEach(r => {
    const a = byInv.get(r.invoiceNo) || []; a.push(r); byInv.set(r.invoiceNo, a)
  })
  return invoices.map(inv => {
    const rs = byInv.get(inv.invoiceNo) || []
    const received = r2(rs.reduce((a, r) => a + r.amount, 0))
    const outstanding = inv.status === 'VOID' ? 0 : r2(inv.total - inv.paidAtInvoice - received)
    const paid = inv.paidAtInvoice + received
    const payStatus = inv.status === 'VOID' ? 'VOID' : outstanding <= 0.005 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'
    const lastActivity = rs.reduce((m, r) => (r.date > m ? r.date : m), inv.date)
    const daysOverdue = outstanding > 0.005 && inv.dueDate ? Math.max(0, daysBetween(inv.dueDate, today)) : 0
    return { ...inv, received, outstanding: Math.max(0, outstanding), payStatus, daysOverdue, lastActivity, age: daysBetween(inv.date, today) }
  })
}

export function receiptsFor(invNo: string, receipts: Receipt[] = []) {
  return receipts.filter(r => r.invoiceNo === invNo)
}

// ---------------------------------------------------------------- monthly series
export interface MonthRow {
  month: string; sales: number; vat: number; grossSales: number; receipts: number; purchases: number
  expenses: number; cogs: number; grossMargin: number; invoices: number; avgInvoice: number; qty: number; net: number
}

export function monthRange(from: string, to: string) {
  const out: string[] = []
  let m = from.slice(0, 7)
  while (m <= to.slice(0, 7) && out.length < 240) { out.push(m); m = addMonths(m, 1) }
  return out
}

export function monthlySeries(d: {
  invoices?: Invoice[]; invoiceLines?: InvoiceLine[]; receipts?: Receipt[]; purchases?: Purchase[]; expenses?: Expense[]
}, months: string[]): MonthRow[] {
  const map = new Map<string, MonthRow>(months.map(m => [m, {
    month: m, sales: 0, vat: 0, grossSales: 0, receipts: 0, purchases: 0, expenses: 0, cogs: 0, grossMargin: 0,
    invoices: 0, avgInvoice: 0, qty: 0, net: 0,
  }]))
  const active = new Set((d.invoices || []).filter(i => i.status !== 'VOID').map(i => i.invoiceNo))
  ;(d.invoices || []).forEach(i => {
    if (i.status === 'VOID') return
    const row = map.get(i.date.slice(0, 7)); if (!row) return
    row.sales += i.subtotal; row.vat += i.vat; row.grossSales += i.total; row.invoices += 1
    row.receipts += i.paidAtInvoice
  })
  ;(d.invoiceLines || []).forEach(l => {
    if (!active.has(l.invoiceNo)) return
    const row = map.get(l.date.slice(0, 7)); if (!row) return
    row.cogs += l.qty * (l.unitCost || 0); row.qty += l.qty
  })
  ;(d.receipts || []).forEach(r => { if (r.status === 'VOID') return; const row = map.get(r.date.slice(0, 7)); if (row) row.receipts += r.amount })
  ;(d.purchases || []).forEach(p => { const row = map.get(p.date.slice(0, 7)); if (row) row.purchases += p.total })
  ;(d.expenses || []).forEach(e => { const row = map.get(e.date.slice(0, 7)); if (row) row.expenses += e.amount })
  return months.map(m => {
    const r = map.get(m)!
    r.grossMargin = r.sales - r.cogs
    r.avgInvoice = r.invoices ? r.sales / r.invoices : 0
    r.net = r.sales - r.purchases - r.expenses
    ;(Object.keys(r) as (keyof MonthRow)[]).forEach(k => { if (k !== 'month') (r as any)[k] = r2(r[k] as number) })
    return r
  })
}

export function groupSales(lines: InvoiceLine[] = [], invoices: Invoice[] = [], key: 'productName' | 'customerName' | 'category', products: Product[] = []) {
  const active = new Set(invoices.filter(i => i.status !== 'VOID').map(i => i.invoiceNo))
  const cat = new Map(products.map(p => [p.code, p.category]))
  const m = new Map<string, { name: string; sales: number; qty: number; cogs: number; margin: number; count: number }>()
  lines.forEach(l => {
    if (!active.has(l.invoiceNo)) return
    const name = key === 'category' ? (cat.get(l.productCode) || 'Other') : l[key]
    const row = m.get(name) || { name, sales: 0, qty: 0, cogs: 0, margin: 0, count: 0 }
    row.sales += l.lineTotal; row.qty += l.qty; row.cogs += l.qty * (l.unitCost || 0); row.count++
    m.set(name, row)
  })
  return [...m.values()].map(r => ({ ...r, sales: r2(r.sales), cogs: r2(r.cogs), margin: r2(r.sales - r.cogs) })).sort((a, b) => b.sales - a.sales)
}

// ---------------------------------------------------------------- accounting
export interface TBRow { code: string; name: string; type: string; debit: number; credit: number; balance: number }

export function trialBalance(accounts: Account[] = [], journal: JournalLine[] = [], upTo?: string): TBRow[] {
  const sums = new Map<string, { d: number; c: number }>()
  journal.forEach(j => {
    if (upTo && j.date > upTo) return
    const s = sums.get(j.acct) || { d: 0, c: 0 }; s.d += j.debit; s.c += j.credit; sums.set(j.acct, s)
  })
  return accounts.map(a => {
    const s = sums.get(a.code) || { d: 0, c: 0 }
    return { code: a.code, name: a.name, type: a.type, debit: r2(s.d), credit: r2(s.c), balance: r2(s.d - s.c) }
  })
}

export function profitAndLoss(accounts: Account[] = [], journal: JournalLine[] = [], from: string, to: string) {
  const inRange = journal.filter(j => j.date >= from && j.date <= to)
  const tb = trialBalance(accounts, inRange)
  const income = tb.filter(r => r.type === 'Income').map(r => ({ ...r, amount: -r.balance }))
  const expenses = tb.filter(r => r.type === 'Expense').map(r => ({ ...r, amount: r.balance }))
  const totalIncome = r2(income.reduce((a, r) => a + r.amount, 0))
  const totalExp = r2(expenses.reduce((a, r) => a + r.amount, 0))
  return { income, expenses, totalIncome, totalExp, net: r2(totalIncome - totalExp) }
}

export function balanceSheet(accounts: Account[] = [], journal: JournalLine[] = [], asOf: string) {
  const tb = trialBalance(accounts, journal, asOf)
  const assets = tb.filter(r => r.type === 'Asset').map(r => ({ ...r, amount: r.balance }))
  const liabilities = tb.filter(r => r.type === 'Liability').map(r => ({ ...r, amount: -r.balance }))
  const equity = tb.filter(r => r.type === 'Equity').map(r => ({ ...r, amount: -r.balance }))
  const earnings = -tb.filter(r => r.type === 'Income' || r.type === 'Expense').reduce((a, r) => a + r.balance, 0)
  const tA = r2(assets.reduce((a, r) => a + r.amount, 0))
  const tL = r2(liabilities.reduce((a, r) => a + r.amount, 0))
  const tE = r2(equity.reduce((a, r) => a + r.amount, 0) + earnings)
  return { assets, liabilities, equity, earnings: r2(earnings), tA, tL, tE, balanced: Math.abs(tA - tL - tE) < 0.01 }
}

// ---------------------------------------------------------------- forecasting
export interface ForecastPoint { month: string; actual?: number; fitted?: number; forecast?: number; lo?: number; hi?: number }

function holt(y: number[], a: number, b: number) {
  let level = y[0], trend = y.length > 1 ? y[1] - y[0] : 0
  const fitted: number[] = [y[0]]
  for (let t = 1; t < y.length; t++) {
    const f = level + trend
    fitted.push(f)
    const nl = a * y[t] + (1 - a) * (level + trend)
    trend = b * (nl - level) + (1 - b) * trend
    level = nl
  }
  return { level, trend, fitted }
}

function linreg(y: number[]) {
  const n = y.length, xs = y.map((_, i) => i)
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  xs.forEach((x, i) => { num += (x - mx) * (y[i] - my); den += (x - mx) ** 2 })
  const slope = den ? num / den : 0
  return { slope, intercept: my - slope * mx }
}

export type ForecastMethod = 'holt' | 'linear' | 'average'

export function forecastSeries(months: string[], values: number[], horizon: number, method: ForecastMethod | 'auto' = 'auto') {
  // drop leading empty months so a new business isn't dragged down by zeros before it started
  let start = values.findIndex(v => v !== 0)
  if (start < 0) start = values.length
  const y = values.slice(start), ms = months.slice(start)
  const lastMonth = months[months.length - 1]
  const future = Array.from({ length: horizon }, (_, i) => addMonths(lastMonth, i + 1))
  if (y.length < 2) {
    const v = y[0] || 0
    const pts: ForecastPoint[] = [
      ...months.map((m, i) => ({ month: m, actual: values[i] })),
      ...future.map(m => ({ month: m, forecast: r2(v), lo: r2(v * 0.7), hi: r2(v * 1.3) })),
    ]
    return { method: 'average' as ForecastMethod, rmse: 0, mape: null as number | null, points: pts, params: {} as Record<string, number>, growth: 0, enoughData: false }
  }

  const candidates: { method: ForecastMethod; fitted: number[]; predict: (h: number) => number; params: Record<string, number> }[] = []
  // Holt: grid search alpha/beta on one-step-ahead error
  let best: { a: number; b: number; sse: number } | null = null
  for (let a = 0.1; a <= 0.91; a += 0.1) for (let b = 0.05; b <= 0.61; b += 0.05) {
    const { fitted } = holt(y, a, b)
    const sse = y.slice(1).reduce((s, v, i) => s + (v - fitted[i + 1]) ** 2, 0)
    if (!best || sse < best.sse) best = { a, b, sse }
  }
  const h = holt(y, best!.a, best!.b)
  candidates.push({ method: 'holt', fitted: h.fitted, predict: k => h.level + k * h.trend, params: { alpha: r2(best!.a), beta: r2(best!.b) } })
  const lr = linreg(y)
  candidates.push({ method: 'linear', fitted: y.map((_, i) => lr.intercept + lr.slope * i), predict: k => lr.intercept + lr.slope * (y.length - 1 + k), params: { slope: r2(lr.slope) } })
  const w = Math.min(3, y.length)
  const avg = y.slice(-w).reduce((a, b) => a + b, 0) / w
  candidates.push({ method: 'average', fitted: y.map((_, i) => { const s = y.slice(Math.max(0, i - w), i); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : y[0] }), predict: () => avg, params: { window: w } })

  const score = (c: typeof candidates[number]) => {
    const errs = y.slice(1).map((v, i) => v - c.fitted[i + 1])
    const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length)
    const pe = y.slice(1).map((v, i) => (v ? Math.abs((v - c.fitted[i + 1]) / v) : null)).filter((x): x is number => x !== null)
    const mape = pe.length ? pe.reduce((a, b) => a + b, 0) / pe.length : null
    return { rmse, mape }
  }
  const scored = candidates.map(c => ({ c, ...score(c) }))
  const chosen = method === 'auto' ? scored.sort((a, b) => a.rmse - b.rmse)[0] : scored.find(s => s.c.method === method)!
  const { c, rmse, mape } = chosen
  const offset = months.length - ms.length
  const points: ForecastPoint[] = months.map((m, i) => ({
    month: m, actual: values[i], fitted: i >= offset ? r2(Math.max(0, c.fitted[i - offset])) : undefined,
  }))
  future.forEach((m, i) => {
    const f = Math.max(0, c.predict(i + 1))
    const band = 1.28 * rmse * Math.sqrt(i + 1) // ~80% interval
    points.push({ month: m, forecast: r2(f), lo: r2(Math.max(0, f - band)), hi: r2(f + band) })
  })
  // bridge the lines so the chart has no gap
  const last = points[months.length - 1]
  last.forecast = last.actual; last.lo = last.actual; last.hi = last.actual
  const lastActual = y[y.length - 1] || 0
  const growth = lastActual ? (c.predict(1) - lastActual) / lastActual : 0
  return { method: c.method, rmse: r2(rmse), mape, points, params: c.params, growth, enoughData: y.length >= 4 }
}

// ---------------------------------------------------------------- data hygiene (Salesforce-style KPIs)
export type Severity = 'Critical' | 'Needs attention' | 'Clean'
export interface HygieneFlag { key: string; label: string; severity: Exclude<Severity, 'Clean'>; fix: string }
export interface HygieneRow { inv: InvoiceState; customer?: Customer; flags: HygieneFlag[]; state: Severity; suggestedNextStep: string }

export const ISSUE_LABELS: Record<string, string> = {
  pastDue: 'Past due date', noNextStep: 'No next step', stale: 'No activity 14d+', noAmount: 'Missing amount',
  noContact: 'No contact on file', vatMismatch: 'VAT status mismatch', stuck: 'Stuck (> 2× median)',
}

function mmdd(iso: string) { return iso.slice(5, 7) + '/' + iso.slice(8, 10) }

export function hygieneAudit(states: InvoiceState[], customers: Customer[] = [], today = todayISO()) {
  const open = states.filter(s => s.payStatus !== 'VOID' && s.payStatus !== 'PAID')
  const paid = states.filter(s => s.payStatus === 'PAID')
  // median age of paid invoices at last payment = typical collection cycle
  const cycles = paid.map(s => daysBetween(s.date, s.lastActivity)).sort((a, b) => a - b)
  const median = cycles.length ? cycles[Math.floor(cycles.length / 2)] : 14
  const custByName = new Map(customers.map(c => [c.name, c]))
  const rows: HygieneRow[] = open.map(inv => {
    const c = custByName.get(inv.customerName)
    const who = c?.contact || c?.name || inv.customerName
    const flags: HygieneFlag[] = []
    const next = addDaysISO(today, inv.daysOverdue > 0 ? 1 : 3)
    if (!(inv.total > 0)) flags.push({ key: 'noAmount', label: 'No amount', severity: 'Critical', fix: 'Invoice total is GHS 0 — correct the lines or void it' })
    if (inv.daysOverdue > 0) flags.push({
      key: 'pastDue', label: `Past due ${inv.daysOverdue}d`, severity: inv.daysOverdue > 30 || !inv.nextStep ? 'Critical' : 'Needs attention',
      fix: `Due ${inv.daysOverdue} days ago — chase ${who}${c?.phone ? ' (' + c.phone + ')' : ''} and agree a pay date`,
    })
    if (!inv.nextStep.trim()) flags.push({
      key: 'noNextStep', label: 'No next step', severity: inv.daysOverdue > 0 || daysBetween(today, inv.dueDate) <= 3 ? 'Critical' : 'Needs attention',
      fix: `Add a dated next step, e.g. "${mmdd(next)} - Call ${who} for payment"`,
    })
    const idle = daysBetween(inv.lastActivity, today)
    if (idle >= 14) flags.push({ key: 'stale', label: `Stale ${idle}d`, severity: 'Needs attention', fix: `No payment activity in ${idle} days — log a follow-up or send a statement` })
    if (!c || (!c.contact && !c.phone)) flags.push({ key: 'noContact', label: 'No contact', severity: 'Needs attention', fix: 'Customer has no contact person or phone — add one on the Customers page' })
    else if (!c.phone || !c.contact) flags.push({ key: 'noContact', label: 'Single contact detail', severity: 'Needs attention', fix: `Only ${c.phone ? 'a phone' : 'a name'} on file — add the ${c.phone ? 'contact person' : 'phone number'}` })
    if (c && ((c.vatStatus === 'VAT') !== (inv.vatApplied === 'Y'))) flags.push({ key: 'vatMismatch', label: 'VAT mismatch', severity: 'Needs attention', fix: `Customer is ${c.vatStatus} but invoice ${inv.vatApplied === 'Y' ? 'charges' : 'has no'} VAT — confirm` })
    if (cycles.length >= 3 && inv.age > Math.max(2 * median, 14)) flags.push({ key: 'stuck', label: `Open ${inv.age}d`, severity: 'Needs attention', fix: `Open ${inv.age} days vs a typical ${median}-day collection cycle` })
    const state: Severity = flags.some(f => f.severity === 'Critical') ? 'Critical' : flags.length ? 'Needs attention' : 'Clean'
    return { inv, customer: c, flags, state, suggestedNextStep: `${mmdd(next)} - Call ${who} to collect ${inv.invoiceNo}` }
  })
  const order = { Critical: 0, 'Needs attention': 1, Clean: 2 }
  rows.sort((a, b) => order[a.state] - order[b.state] || b.inv.outstanding - a.inv.outstanding)
  const counts = { Critical: 0, 'Needs attention': 0, Clean: 0 } as Record<Severity, number>
  rows.forEach(r => counts[r.state]++)
  const issueCounts: Record<string, number> = {}
  rows.forEach(r => new Set(r.flags.map(f => f.key)).forEach(k => { issueCounts[k] = (issueCounts[k] || 0) + 1 }))
  const issues = Object.entries(issueCounts).map(([k, v]) => ({ key: k, label: ISSUE_LABELS[k], count: v })).sort((a, b) => b.count - a.count)
  const atRisk = r2(rows.filter(r => r.state === 'Critical').reduce((a, r) => a + r.inv.outstanding, 0))
  const totalOpen = r2(open.reduce((a, s) => a + s.outstanding, 0))
  return { rows, counts, issues, atRisk, totalOpen, median, open: open.length }
}

export function masterDataAudit(products: Product[] = [], suppliers: Supplier[] = [], customers: Customer[] = []) {
  const out: { area: string; record: string; issue: string; fix: string; severity: 'Critical' | 'Needs attention' }[] = []
  products.filter(p => p.active !== 'N').forEach(p => {
    if (!(p.cost > 0)) out.push({ area: 'Products', record: p.name, issue: 'Missing cost price', severity: 'Critical', fix: 'Enter the supplier cost so margins and COGS are correct' })
    else if (p.price <= p.cost) out.push({ area: 'Products', record: p.name, issue: 'Selling at or below cost', severity: 'Critical', fix: `Price GHS ${p.price} vs cost GHS ${p.cost.toFixed(2)}` })
    if (!p.supplier) out.push({ area: 'Products', record: p.name, issue: 'No supplier', severity: 'Needs attention', fix: 'Link the product to a supplier' })
  })
  suppliers.forEach(s => {
    if (!s.phone && !s.email) out.push({ area: 'Suppliers', record: s.name, issue: 'No phone or email', severity: 'Needs attention', fix: 'Add a phone number or email for re-ordering' })
    if (!s.contact) out.push({ area: 'Suppliers', record: s.name, issue: 'No contact person', severity: 'Needs attention', fix: 'Add who you deal with at this supplier' })
  })
  const seen = new Map<string, string>()
  customers.forEach(c => {
    if (c.vatStatus === 'VAT' && !c.tin) out.push({ area: 'Customers', record: c.name, issue: 'VAT customer without TIN', severity: 'Needs attention', fix: 'Add the Ghana Card / TIN for VAT invoices' })
    if (!c.phone && !c.email) out.push({ area: 'Customers', record: c.name, issue: 'No phone or email', severity: 'Needs attention', fix: 'Add at least one way to reach the customer' })
    const key = c.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (seen.has(key)) out.push({ area: 'Customers', record: c.name, issue: 'Possible duplicate', severity: 'Needs attention', fix: `Looks like "${seen.get(key)}"` })
    seen.set(key, c.name)
  })
  return out
}

function addDaysISO(iso: string, d: number) { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10) }
export { addDaysISO }
