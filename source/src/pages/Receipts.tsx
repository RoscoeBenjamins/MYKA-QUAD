import { useMemo, useState } from 'react'
import { useApp, go } from '@/lib/store'
import { api } from '@/lib/api'
import { invoiceStates } from '@/lib/analytics'
import { fmtDate, money, num, todayISO } from '@/lib/fmt'
import { PAY_METHODS } from '@/lib/types'
import { PageHeader, Panel, DataTable, Tag, Field, NativeSelect, TextInput, Empty } from '@/components/kit'
import { ReceiptDoc, DocActions } from '@/components/Documents'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, ReceiptText, Ban } from 'lucide-react'

export default function Receipts({ sub }: { sub?: string }) {
  if (sub === 'new') return <NewReceipt />
  if (sub) return <ViewReceipt no={decodeURIComponent(sub)} />
  return <ReceiptList />
}

function ReceiptList() {
  const { data, canWrite } = useApp()
  const rows = data!.receipts || []
  const total = rows.filter(r => r.status !== 'VOID').reduce((a, r) => a + r.amount, 0)
  return (
    <div>
      <PageHeader title="Receipts" sub={`Receipt register · ${rows.length} receipts · ${money(total)} received`}
        actions={canWrite && <Button onClick={() => go('/receipts/new')}><ReceiptText className="h-4 w-4 mr-1.5" />New receipt</Button>} />
      <DataTable rows={rows} filename="receipt-register.csv" initialSort={{ key: 'date', dir: 'desc' }} onRow={r => go('/receipts/' + encodeURIComponent(r.receiptNo))}
        cols={[
          { key: 'receiptNo', label: 'Receipt No', render: r => <span className="mono text-xs font-medium">{r.receiptNo}</span> },
          { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
          { key: 'customerName', label: 'Customer' },
          { key: 'invoiceNo', label: 'Against invoice', render: r => <span className="mono text-xs">{r.invoiceNo}</span> },
          { key: 'amount', label: 'Amount', align: 'right', render: r => num(r.amount, 2) },
          { key: 'method', label: 'Method' },
          { key: 'receivedBy', label: 'Received by' },
          { key: 'status', label: 'Status', render: r => <span className="flex gap-1"><Tag>{r.status}</Tag>{r.isDemo === 'Y' && <Tag tone="DEMO">DEMO</Tag>}</span> },
        ]} empty="No receipts yet." />
    </div>
  )
}

function NewReceipt() {
  const { data, reload, user } = useApp()
  const d = data!
  const pre = new URLSearchParams(window.location.hash.split('?')[1] || '').get('inv') || ''
  const open = useMemo(() => invoiceStates(d.invoices, d.receipts).filter(s => s.outstanding > 0 && s.status !== 'VOID'), [d])
  const [invNo, setInvNo] = useState(open.some(o => o.invoiceNo === pre) ? pre : '')
  const inv = open.find(o => o.invoiceNo === invNo)
  const [amount, setAmount] = useState(inv ? String(inv.outstanding) : '')
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState('Cash')
  const [receivedBy, setReceivedBy] = useState(user?.name || '')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const s = d.settings
  return (
    <div>
      <PageHeader title="New receipt" sub={<>Next number <span className="mono font-semibold">{s.rctPrefix}-{s.rctYear}-{s.rctNext}</span> · Dr Cash/MoMo/Bank, Cr Accounts Receivable</>}
        actions={<Button variant="ghost" onClick={() => go('/receipts')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>} />
      {!open.length ? <Empty title="No open invoices">Every invoice is fully paid. Record an invoice first.</Empty> : (
        <Panel className="max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Against invoice" className="sm:col-span-2">
              <NativeSelect value={invNo} onChange={e => { setInvNo(e.target.value); const o = open.find(x => x.invoiceNo === e.target.value); setAmount(o ? String(o.outstanding) : '') }}>
                <option value="">— choose an open invoice —</option>
                {open.sort((a, b) => a.customerName.localeCompare(b.customerName)).map(o => <option key={o.invoiceNo} value={o.invoiceNo}>{o.customerName} · {o.invoiceNo} · owes {num(o.outstanding, 2)}</option>)}
              </NativeSelect>
            </Field>
            {inv && <div className="sm:col-span-2 grid grid-cols-3 gap-2 text-sm bg-secondary/60 rounded p-3">
              <div><div className="text-xs text-muted-foreground">Customer</div><b>{inv.customerName}</b></div>
              <div><div className="text-xs text-muted-foreground">Invoice total</div><b className="tabular">{money(inv.total)}</b></div>
              <div><div className="text-xs text-muted-foreground">Outstanding</div><b className="tabular text-bad">{money(inv.outstanding)}</b></div>
            </div>}
            <Field label="Amount received (GHS)"><TextInput type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
            <Field label="Date"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Payment method"><NativeSelect value={method} onChange={e => setMethod(e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</NativeSelect></Field>
            <Field label="Received by"><TextInput value={receivedBy} onChange={e => setReceivedBy(e.target.value)} /></Field>
            <Field label="Notes" className="sm:col-span-2"><TextInput value={notes} onChange={e => setNotes(e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 mt-5">
            <Button disabled={busy || !inv || !(Number(amount) > 0)} onClick={async () => {
              setBusy(true)
              try {
                const r = await api('recordReceipt', { invoiceNo: invNo, amount: Number(amount), date, method, receivedBy, notes })
                toast.success(`Receipt ${r.receipt.receiptNo} recorded`)
                await reload(); go('/receipts/' + encodeURIComponent(r.receipt.receiptNo))
              } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record receipt</Button>
            <Button variant="ghost" onClick={() => { setInvNo(''); setAmount(''); setNotes('') }}>Reset</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}

function ViewReceipt({ no }: { no: string }) {
  const { data, reload, user, canWrite } = useApp()
  const d = data!
  const r = (d.receipts || []).find(x => x.receiptNo === no)
  const [voidOpen, setVoidOpen] = useState(false); const [busy, setBusy] = useState(false)
  if (!r) return <Empty title="Receipt not found" />
  const inv = (d.invoices || []).find(i => i.invoiceNo === r.invoiceNo)
  // balance right after this receipt (receipts on or before it, in number order)
  const after = inv ? Math.max(0, inv.total - inv.paidAtInvoice - (d.receipts || []).filter(x => x.invoiceNo === r.invoiceNo && x.status !== 'VOID' && (x.date < r.date || (x.date === r.date && x.receiptNo <= r.receiptNo))).reduce((a, x) => a + x.amount, 0)) : undefined
  return (
    <div>
      <PageHeader title={r.receiptNo} sub={`${r.customerName} · ${money(r.amount)} · ${r.method}`}
        actions={<>
          <Button variant="ghost" onClick={() => go('/receipts')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <DocActions targetId="rct-print" filename={`${r.receiptNo}.pdf`} />
          <Button variant="outline" onClick={() => go('/invoices/' + encodeURIComponent(r.invoiceNo))}>View invoice</Button>
          {canWrite && (user?.role === 'admin' || user?.role === 'manager') && r.status !== 'VOID' && <Button variant="outline" className="text-bad" onClick={() => setVoidOpen(true)}><Ban className="h-4 w-4 mr-1.5" />Void</Button>}
        </>} />
      <div id="rct-print" className="print-area overflow-x-auto"><ReceiptDoc r={r} s={d.settings} inv={inv} outstandingAfter={r.status === 'VOID' ? undefined : after} /></div>
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void {no}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The payment is reversed in the general journal and the invoice balance goes back up by {money(r.amount)}.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={async () => {
              setBusy(true)
              try { await api('voidReceipt', { receiptNo: no }); await reload(); setVoidOpen(false); toast.success('Receipt voided') }
              catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>Void receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
