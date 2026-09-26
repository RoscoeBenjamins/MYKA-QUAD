import { useMemo, useState } from 'react'
import { useApp, go } from '@/lib/store'
import { api } from '@/lib/api'
import { trialBalance, profitAndLoss, balanceSheet, monthlySeries, monthRange } from '@/lib/analytics'
import { fmtDate, money, num, todayISO, monthLabel } from '@/lib/fmt'
import { PageHeader, Panel, DataTable, Tag, Field, NativeSelect, TextInput } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Trash2, Printer, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  ['journal', 'General Journal'], ['tb', 'Trial Balance'], ['pl', 'Profit & Loss'], ['bs', 'Balance Sheet'],
  ['sales', 'Sales Journal'], ['vat', 'VAT Report'], ['coa', 'Chart of Accounts'],
] as const

export default function Accounting({ tab = 'journal' }: { tab?: string }) {
  return (
    <div>
      <PageHeader title="Accounting" sub="Double-entry books — every invoice, receipt, purchase and expense posts here automatically"
        actions={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>} />
      <div className="flex flex-wrap gap-1 mb-5 border-b no-print">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => go('/accounting/' + k)} className={cn('px-3 py-2 text-sm font-semibold border-b-2 -mb-px', tab === k ? 'border-flame text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      <div className="print-report">
        {tab === 'journal' && <Journal />}
        {tab === 'tb' && <TB />}
        {tab === 'pl' && <PL />}
        {tab === 'bs' && <BS />}
        {tab === 'sales' && <SalesJournal />}
        {tab === 'vat' && <VatReport />}
        {tab === 'coa' && <COA />}
      </div>
    </div>
  )
}

function Journal() {
  const { data, canWrite } = useApp()
  const [open, setOpen] = useState(false)
  const rows = data!.journal || []
  return (
    <>
      <DataTable rows={rows} filename="general-journal.csv" initialSort={{ key: 'entryNo', dir: 'desc' }} pageSize={100}
        toolbar={canWrite && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Manual journal</Button>}
        cols={[
          { key: 'entryNo', label: 'JE', align: 'right' },
          { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
          { key: 'ref', label: 'Reference', render: r => <span className="mono text-xs">{r.ref}</span> },
          { key: 'acct', label: 'Acct', render: r => <span className="mono text-xs">{r.acct}</span> },
          { key: 'acctName', label: 'Account' },
          { key: 'debit', label: 'Debit', align: 'right', render: r => r.debit ? num(r.debit, 2) : '' },
          { key: 'credit', label: 'Credit', align: 'right', render: r => r.credit ? num(r.credit, 2) : '' },
          { key: 'description', label: 'Description', className: 'min-w-[220px] max-w-[320px]' },
          { key: 'source', label: 'Source', render: r => <Tag>{r.source}</Tag> },
        ]} empty="No journal entries yet." />
      <ManualJournal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function ManualJournal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, reload } = useApp()
  const accts = data!.accounts || []
  const [date, setDate] = useState(todayISO()); const [ref, setRef] = useState(''); const [desc, setDesc] = useState('')
  const [lines, setLines] = useState([{ acct: '', debit: '', credit: '' }, { acct: '', debit: '', credit: '' }])
  const [busy, setBusy] = useState(false)
  const dr = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0), cr = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0)
  const set = (i: number, p: any) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Manual journal entry</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">For owner capital, supplier payments (Dr 2000 A/P, Cr Cash), COGS / stock adjustments, VAT payments to GRA, etc.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Reference"><TextInput value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. PAY-DANLECT" /></Field>
          <Field label="Description *"><TextInput value={desc} onChange={e => setDesc(e.target.value)} /></Field>
        </div>
        <table className="w-full text-sm mt-2">
          <thead><tr className="text-xs text-muted-foreground text-left"><th>Account</th><th className="w-28">Debit</th><th className="w-28">Credit</th><th className="w-6" /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><NativeSelect value={l.acct} onChange={e => set(i, { acct: e.target.value })}><option value="">—</option>{accts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</NativeSelect></td>
                <td className="py-1 pr-2"><TextInput type="number" step="0.01" value={l.debit} onChange={e => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></td>
                <td className="py-1 pr-2"><TextInput type="number" step="0.01" value={l.credit} onChange={e => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></td>
                <td>{lines.length > 2 && <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold"><td className="pt-2"><Button size="sm" variant="ghost" onClick={() => setLines(ls => [...ls, { acct: '', debit: '', credit: '' }])}><Plus className="h-3.5 w-3.5 mr-1" />Line</Button></td><td className="tabular pt-2">{num(dr, 2)}</td><td className="tabular pt-2">{num(cr, 2)}</td><td /></tr></tfoot>
        </table>
        <div className={cn('text-sm', Math.abs(dr - cr) < 0.005 && dr > 0 ? 'text-ok' : 'text-bad')}>{Math.abs(dr - cr) < 0.005 && dr > 0 ? 'Balanced ✓' : `Out of balance by ${num(dr - cr, 2)}`}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || Math.abs(dr - cr) >= 0.005 || !dr || !desc} onClick={async () => {
            setBusy(true)
            try {
              const r = await api('postJournal', { date, ref, description: desc, lines: lines.filter(l => l.acct).map(l => ({ acct: l.acct, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) })
              toast.success(`Journal entry ${r.entryNo} posted`); await reload(); onClose()
              setLines([{ acct: '', debit: '', credit: '' }, { acct: '', debit: '', credit: '' }]); setDesc(''); setRef('')
            } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Post entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TB() {
  const { data } = useApp()
  const [asOf, setAsOf] = useState(todayISO())
  const rows = trialBalance(data!.accounts, data!.journal, asOf)
  const dr = rows.reduce((a, r) => a + r.debit, 0), cr = rows.reduce((a, r) => a + r.credit, 0)
  const ok = Math.abs(dr - cr) < 0.01
  return (
    <Panel title={`Trial Balance as of ${fmtDate(asOf)}`} actions={<TextInput type="date" className="w-40 no-print" value={asOf} onChange={e => setAsOf(e.target.value)} />}>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2">Code</th><th>Account</th><th>Type</th><th className="text-right">Total Debit</th><th className="text-right">Total Credit</th><th className="text-right">Balance</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.code} className="border-b"><td className="py-1.5 mono text-xs">{r.code}</td><td>{r.name}</td><td className="text-muted-foreground">{r.type}</td>
              <td className="text-right tabular">{num(r.debit, 2)}</td><td className="text-right tabular">{num(r.credit, 2)}</td><td className="text-right tabular font-medium">{num(r.balance, 2)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr className="font-extrabold"><td colSpan={3} className="py-2">TOTALS</td><td className="text-right tabular">{num(dr, 2)}</td><td className="text-right tabular">{num(cr, 2)}</td>
          <td className="text-right">{ok ? <Tag tone="PAID">Balanced</Tag> : <Tag tone="UNPAID">Out by {num(dr - cr, 2)}</Tag>}</td></tr></tfoot>
      </table>
    </Panel>
  )
}

function PL() {
  const { data } = useApp()
  const [from, setFrom] = useState(todayISO().slice(0, 4) + '-01-01'); const [to, setTo] = useState(todayISO())
  const p = profitAndLoss(data!.accounts, data!.journal, from, to)
  const Row = ({ l, v, b }: { l: string; v: number; b?: boolean }) => <div className={cn('flex justify-between py-1.5 border-b', b && 'font-extrabold border-foreground/30')}><span>{l}</span><span className="tabular">{num(v, 2)}</span></div>
  return (
    <Panel title="Profit & Loss" sub={`${fmtDate(from)} to ${fmtDate(to)}`} actions={<div className="flex gap-2 no-print"><TextInput type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} /><TextInput type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} /></div>}>
      <div className="max-w-xl text-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-2">Income</div>
        {p.income.map(r => <Row key={r.code} l={`${r.code} ${r.name}`} v={r.amount} />)}
        <Row l="Total income" v={p.totalIncome} b />
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-5">Expenses</div>
        {p.expenses.map(r => <Row key={r.code} l={`${r.code} ${r.name}`} v={r.amount} />)}
        <Row l="Total expenses" v={p.totalExp} b />
        <div className={cn('flex justify-between py-3 mt-3 text-lg font-extrabold', p.net >= 0 ? 'text-ok' : 'text-bad')}><span>Net {p.net >= 0 ? 'profit' : 'loss'}</span><span className="tabular">{money(p.net)}</span></div>
        <p className="text-xs text-muted-foreground">Purchases are expensed when bought (as in the Excel workbook). Post a manual Dr 1200 Inventory / Cr 5100 Purchases for closing stock if you want profit on a stock-adjusted basis.</p>
      </div>
    </Panel>
  )
}

function BS() {
  const { data } = useApp()
  const [asOf, setAsOf] = useState(todayISO())
  const b = balanceSheet(data!.accounts, data!.journal, asOf)
  const Sec = ({ title, rows, total }: { title: string; rows: { code: string; name: string; amount: number }[]; total: number }) => (
    <div className="mb-5">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      {rows.map(r => <div key={r.code} className="flex justify-between py-1.5 border-b"><span>{r.code} {r.name}</span><span className="tabular">{num(r.amount, 2)}</span></div>)}
      <div className="flex justify-between py-1.5 font-extrabold"><span>Total {title.toLowerCase()}</span><span className="tabular">{num(total, 2)}</span></div>
    </div>
  )
  return (
    <Panel title={`Balance Sheet as of ${fmtDate(asOf)}`} actions={<TextInput type="date" className="w-40 no-print" value={asOf} onChange={e => setAsOf(e.target.value)} />}>
      <div className="grid md:grid-cols-2 gap-8 text-sm">
        <Sec title="Assets" rows={b.assets} total={b.tA} />
        <div>
          <Sec title="Liabilities" rows={b.liabilities} total={b.tL} />
          <Sec title="Equity" rows={[...b.equity, { code: '', name: 'Current period earnings', amount: b.earnings }]} total={b.tE} />
          <div className="flex justify-between font-extrabold border-t-2 pt-2"><span>Liabilities + equity</span><span className="tabular">{num(b.tL + b.tE, 2)}</span></div>
          <div className="mt-2">{b.balanced ? <Tag tone="PAID">Assets = Liabilities + Equity</Tag> : <Tag tone="UNPAID">Does not balance</Tag>}</div>
        </div>
      </div>
    </Panel>
  )
}

function SalesJournal() {
  const { data } = useApp()
  const voids = new Set((data!.invoices || []).filter(i => i.status === 'VOID').map(i => i.invoiceNo))
  return (
    <DataTable rows={(data!.invoiceLines || []).map(l => ({ ...l, void: voids.has(l.invoiceNo) }))} filename="sales-journal.csv" initialSort={{ key: 'date', dir: 'desc' }} pageSize={100}
      cols={[
        { key: 'invoiceNo', label: 'Invoice', render: r => <a className="mono text-xs underline" href={'#/invoices/' + r.invoiceNo}>{r.invoiceNo}</a> },
        { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
        { key: 'customerName', label: 'Customer' },
        { key: 'productCode', label: 'Code', render: r => <span className="mono text-xs">{r.productCode}</span> },
        { key: 'productName', label: 'Product' },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'unitPrice', label: 'Unit price', align: 'right', render: r => num(r.unitPrice, 2) },
        { key: 'lineTotal', label: 'Line total', align: 'right', render: r => <span className={r.void ? 'line-through text-muted-foreground' : ''}>{num(r.lineTotal, 2)}</span> },
      ]} />
  )
}

function VatReport() {
  const { data } = useApp()
  const d = data!
  const first = (d.invoices || []).map(i => i.date).sort()[0] || todayISO()
  const rows = useMemo(() => monthlySeries(d, monthRange(first, todayISO())).reverse(), [d])
  const tb = trialBalance(d.accounts, d.journal).find(r => r.code === '2100')
  return (
    <>
      <p className="text-sm text-muted-foreground mb-3">Output VAT at the flat {(Number(d.settings.vatRate) * 100).toFixed(1)}% set in Admin → Settings. VAT Payable balance (acct 2100): <b className="text-foreground">{money(-(tb?.balance || 0))}</b>. Confirm the rate against Myka Quad's GRA registration.</p>
      <DataTable rows={rows} searchable={false} filename="vat-report.csv"
        cols={[
          { key: 'month', label: 'Month', render: r => monthLabel(r.month) },
          { key: 'invoices', label: 'Invoices', align: 'right' },
          { key: 'sales', label: 'Sales ex-VAT', align: 'right', render: r => num(r.sales, 2) },
          { key: 'vat', label: 'VAT charged', align: 'right', render: r => num(r.vat, 2) },
          { key: 'grossSales', label: 'Sales incl. VAT', align: 'right', render: r => num(r.grossSales, 2) },
        ]} />
    </>
  )
}

function COA() {
  const { data, canWrite, reload } = useApp()
  const [f, setF] = useState({ code: '', name: '', type: 'Expense', notes: '' })
  const [busy, setBusy] = useState(false)
  return (
    <>
      <DataTable rows={data!.accounts || []} searchable={false} filename="chart-of-accounts.csv"
        cols={[
          { key: 'code', label: 'Code', render: r => <span className="mono">{r.code}</span> },
          { key: 'name', label: 'Account' }, { key: 'type', label: 'Type' }, { key: 'normal', label: 'Normal balance' }, { key: 'notes', label: 'Notes' },
        ]} />
      {canWrite && (
        <Panel title="Add account" className="mt-4 max-w-3xl no-print">
          <div className="grid sm:grid-cols-[100px_1fr_140px_auto] gap-2 items-end">
            <Field label="Code"><TextInput value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="Name"><TextInput value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Type"><NativeSelect value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(t => <option key={t}>{t}</option>)}</NativeSelect></Field>
            <Button disabled={busy || !f.code || !f.name} onClick={async () => {
              setBusy(true)
              try { await api('saveAccount', f); await reload(); toast.success('Account saved'); setF({ code: '', name: '', type: 'Expense', notes: '' }) }
              catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>Save</Button>
          </div>
        </Panel>
      )}
    </>
  )
}
