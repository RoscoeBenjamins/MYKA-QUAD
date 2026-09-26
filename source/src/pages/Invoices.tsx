import { useMemo, useState } from 'react'
import { useApp, go } from '@/lib/store'
import { api } from '@/lib/api'
import { invoiceStates, addDaysISO } from '@/lib/analytics'
import { fmtDate, money, num, todayISO } from '@/lib/fmt'
import { PAY_METHODS, type Customer } from '@/lib/types'
import { PageHeader, Panel, DataTable, Tag, Field, NativeSelect, TextInput, Segmented, Empty } from '@/components/kit'
import { InvoiceDoc, DocActions, EmailDocButton } from '@/components/Documents'
import { CustomerDialog } from '@/pages/MasterData'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { FilePlus2, Plus, Trash2, ArrowLeft, ReceiptText, Ban, Loader2, UserPlus } from 'lucide-react'

export default function Invoices({ sub }: { sub?: string }) {
  if (sub === 'new') return <NewInvoice />
  if (sub) return <ViewInvoice no={decodeURIComponent(sub)} />
  return <InvoiceList />
}

type Filter = 'all' | 'open' | 'overdue' | 'PAID' | 'VOID'

function InvoiceList() {
  const { data, canWrite } = useApp()
  const [f, setF] = useState<Filter>('all')
  const states = useMemo(() => invoiceStates(data!.invoices, data!.receipts), [data])
  const rows = states.filter(s =>
    f === 'all' ? true : f === 'open' ? s.payStatus === 'UNPAID' || s.payStatus === 'PARTIAL' : f === 'overdue' ? s.daysOverdue > 0 : s.payStatus === f)
  const totals = rows.reduce((a, r) => ({ total: a.total + (r.status === 'VOID' ? 0 : r.total), out: a.out + r.outstanding }), { total: 0, out: 0 })
  return (
    <div>
      <PageHeader title="Invoices" sub={`Invoice register · ${rows.length} shown · ${money(totals.total)} billed · ${money(totals.out)} outstanding`}
        actions={canWrite && <Button onClick={() => go('/invoices/new')}><FilePlus2 className="h-4 w-4 mr-1.5" />New invoice</Button>} />
      <DataTable rows={rows} filename="invoice-register.csv" onRow={r => go('/invoices/' + encodeURIComponent(r.invoiceNo))}
        initialSort={{ key: 'date', dir: 'desc' }}
        toolbar={<Segmented value={f} onChange={setF} options={[
          { value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'PAID', label: 'Paid' }, { value: 'VOID', label: 'Void' },
        ]} />}
        cols={[
          { key: 'invoiceNo', label: 'Invoice No', render: r => <span className="mono text-xs font-medium">{r.invoiceNo}</span> },
          { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
          { key: 'customerName', label: 'Customer' },
          { key: 'vatApplied', label: 'VAT' },
          { key: 'subtotal', label: 'Subtotal', align: 'right', render: r => num(r.subtotal, 2) },
          { key: 'vat', label: 'VAT Amt', align: 'right', render: r => num(r.vat, 2) },
          { key: 'total', label: 'Total', align: 'right', render: r => num(r.total, 2) },
          { key: 'received', label: 'Paid', align: 'right', render: r => num(r.paidAtInvoice + r.received, 2), csv: r => r.paidAtInvoice + r.received },
          { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => <span className={r.outstanding > 0 ? 'font-semibold' : ''}>{num(r.outstanding, 2)}</span> },
          { key: 'dueDate', label: 'Due', render: r => <span className={r.daysOverdue > 0 ? 'text-bad font-medium' : ''}>{fmtDate(r.dueDate)}</span> },
          { key: 'payStatus', label: 'Status', render: r => <span className="flex gap-1"><Tag>{r.payStatus}</Tag>{r.emailedAt && <Tag tone="ACTIVE">Emailed</Tag>}{r.isDemo === 'Y' && <Tag tone="DEMO">DEMO</Tag>}</span> },
        ]}
        empty="No invoices yet." />
    </div>
  )
}

interface Line { productCode: string; qty: string; unitPrice: string }

function NewInvoice() {
  const { data, reload } = useApp()
  const d = data!
  const s = d.settings
  const products = (d.products || []).filter(p => p.active !== 'N')
  const customers = [...(d.customers || [])].sort((a, b) => a.name.localeCompare(b.name))
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), Number(s.paymentTermsDays || 14)))
  const [vat, setVat] = useState<'Y' | 'N'>('N')
  const [lines, setLines] = useState<Line[]>([{ productCode: '', qty: '1', unitPrice: '' }])
  const [paid, setPaid] = useState('0')
  const [method, setMethod] = useState('Cash')
  const [nextStep, setNextStep] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [addCust, setAddCust] = useState(false)
  const cust = customers.find(c => c.id === customerId)
  const rate = Number(s.vatRate) || 0

  const calc = lines.map(l => {
    const p = products.find(x => x.code === l.productCode)
    const price = l.unitPrice !== '' ? Number(l.unitPrice) : p?.price || 0
    const qty = Number(l.qty) || 0
    return { p, price, qty, total: Math.round(price * qty * 100) / 100 }
  })
  const subtotal = calc.reduce((a, c) => a + c.total, 0)
  const vatBase = calc.reduce((a, c) => a + (c.p && c.p.vat !== 'N' ? c.total : 0), 0)
  const vatAmt = vat === 'Y' ? Math.round(vatBase * rate * 100) / 100 : 0
  const total = subtotal + vatAmt

  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const pickCustomer = (c?: Customer) => { setCustomerId(c?.id || ''); setVat(c?.vatStatus === 'VAT' ? 'Y' : 'N') }

  const submit = async () => {
    setBusy(true)
    try {
      const r = await api('recordInvoice', {
        customerId, date, dueDate, vatApplied: vat, paidAtInvoice: Number(paid) || 0, payMethod: method, nextStep, notes,
        lines: lines.filter(l => l.productCode && Number(l.qty) > 0).map(l => ({ productCode: l.productCode, qty: Number(l.qty), unitPrice: l.unitPrice })),
      })
      toast.success(`Invoice ${r.invoice.invoiceNo} recorded — ${money(r.invoice.total)}`)
      await reload()
      go('/invoices/' + encodeURIComponent(r.invoice.invoiceNo))
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const nextNo = `${s.invPrefix}-${s.invYear}-${s.invNext}`
  return (
    <div>
      <PageHeader title="New invoice" sub={<>Next number <span className="mono font-semibold">{nextNo}</span> · posts to the invoice register, sales journal and general journal</>}
        actions={<Button variant="ghost" onClick={() => go('/invoices')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>} />
      <div className="grid xl:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <Panel title="Customer">
            <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
              <Field label="Customer">
                <NativeSelect value={customerId} onChange={e => pickCustomer(customers.find(c => c.id === e.target.value))}>
                  <option value="">— choose a customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.isDemo === 'Y' ? ' (demo)' : ''}</option>)}
                </NativeSelect>
              </Field>
              <Button variant="outline" type="button" onClick={() => setAddCust(true)}><UserPlus className="h-4 w-4 mr-1" />New customer</Button>
            </div>
            {cust && (
              <div className="mt-3 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
                <span>{cust.address || 'No address'}</span><span>{cust.phone}</span>
                <span>VAT status on file: <Tag tone={cust.vatStatus === 'VAT' ? 'PAID' : undefined}>{cust.vatStatus}</Tag></span>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              <Field label="Invoice date"><TextInput type="date" value={date} onChange={e => { setDate(e.target.value); setDueDate(addDaysISO(e.target.value, Number(s.paymentTermsDays || 14))) }} /></Field>
              <Field label="Due date"><TextInput type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
              <Field label="Apply VAT to this invoice?" hint={`Flat ${(rate * 100).toFixed(1)}% · guided by the customer's status`}>
                <Segmented value={vat} onChange={setVat} options={[{ value: 'N', label: 'No' }, { value: 'Y', label: 'Yes' }]} />
              </Field>
            </div>
          </Panel>

          <Panel title="Items">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead><tr className="text-xs text-muted-foreground text-left"><th className="pb-2 w-8">#</th><th className="pb-2">Product</th><th className="pb-2 w-16">Unit</th><th className="pb-2 w-24">Qty</th><th className="pb-2 w-32">Unit price</th><th className="pb-2 w-32 text-right">Line total</th><th className="w-8" /></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <NativeSelect value={l.productCode} onChange={e => setLine(i, { productCode: e.target.value, unitPrice: '' })}>
                          <option value="">— product —</option>
                          {products.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                        </NativeSelect>
                      </td>
                      <td className="py-2 text-muted-foreground">{calc[i].p?.unit}</td>
                      <td className="py-2 pr-2"><TextInput type="number" min="0" step="1" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} /></td>
                      <td className="py-2 pr-2"><TextInput type="number" min="0" step="0.01" placeholder={calc[i].p ? String(calc[i].p!.price) : ''} value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} /></td>
                      <td className="py-2 text-right tabular font-medium">{num(calc[i].total, 2)}</td>
                      <td className="py-2 text-right">{lines.length > 1 && <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-bad" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lines.length < 15 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLines(ls => [...ls, { productCode: '', qty: '1', unitPrice: '' }])}><Plus className="h-4 w-4 mr-1" />Add line</Button>}
          </Panel>

          <Panel title="Follow-up">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Next step" hint='Used by the Data Hygiene KPIs, e.g. "10/03 - Call Ama for payment"'><TextInput value={nextStep} onChange={e => setNextStep(e.target.value)} /></Field>
              <Field label="Notes (printed on invoice)"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
            </div>
          </Panel>
        </div>

        <div>
          <div className="bg-card border rounded-md p-4 xl:sticky xl:top-6 space-y-3">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span className="tabular">{num(subtotal, 2)}</span></div>
            <div className="flex justify-between text-sm"><span>VAT {vat === 'Y' ? `(${(rate * 100).toFixed(1)}%)` : ''}</span><span className="tabular">{num(vatAmt, 2)}</span></div>
            <div className="flex justify-between text-lg font-extrabold border-t pt-3"><span>Grand total</span><span className="tabular">{money(total)}</span></div>
            <Field label="Amount paid now"><TextInput type="number" min="0" step="0.01" value={paid} onChange={e => setPaid(e.target.value)} /></Field>
            {Number(paid) > 0 && <Field label="Paid by"><NativeSelect value={method} onChange={e => setMethod(e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</NativeSelect></Field>}
            <div className="flex justify-between text-sm"><span>Balance due</span><span className="tabular font-semibold">{num(Math.max(0, total - (Number(paid) || 0)), 2)}</span></div>
            <Button className="w-full" size="lg" disabled={busy || !customerId || !calc.some(c => c.p && c.qty > 0)} onClick={submit}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record invoice
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => { setLines([{ productCode: '', qty: '1', unitPrice: '' }]); setPaid('0'); setNotes(''); setNextStep(''); pickCustomer(undefined) }}>Reset form</Button>
          </div>
        </div>
      </div>
      <CustomerDialog open={addCust} onClose={() => setAddCust(false)} onSaved={c => pickCustomer(c)} />
    </div>
  )
}

function ViewInvoice({ no }: { no: string }) {
  const { data, reload, user, canWrite } = useApp()
  const d = data!
  const state = invoiceStates(d.invoices, d.receipts).find(s => s.invoiceNo === no)
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [ns, setNs] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!state) return <Empty title="Invoice not found"><Button variant="link" onClick={() => go('/invoices')}>Back to invoices</Button></Empty>
  const lines = (d.invoiceLines || []).filter(l => l.invoiceNo === no)
  const customer = (d.customers || []).find(c => c.id === state.customerId || c.name === state.customerName)
  const pays = (d.receipts || []).filter(r => r.invoiceNo === no)
  const canVoid = canWrite && (user?.role === 'admin' || user?.role === 'manager') && state.status !== 'VOID'
  return (
    <div>
      <PageHeader title={state.invoiceNo} sub={<span className="flex items-center gap-2">{state.customerName} · {money(state.total)} · <Tag>{state.payStatus}</Tag>{state.daysOverdue > 0 && <Tag tone="UNPAID">{state.daysOverdue} days overdue</Tag>}</span>}
        actions={<>
          <Button variant="ghost" onClick={() => go('/invoices')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <DocActions targetId="inv-print" filename={`${state.invoiceNo}.pdf`} />
          {canWrite && state.status !== 'VOID' && <EmailDocButton kind="invoice" no={state.invoiceNo} targetId="inv-print" defaultTo={customer?.email || ''}
            customerName={customer?.contact || state.customerName} summary={`${money(state.total)}, due ${fmtDate(state.dueDate)}`}
            emailedAt={state.emailedAt} emailedTo={state.emailedTo} />}
          {canWrite && state.outstanding > 0 && <Button variant="outline" onClick={() => go('/receipts/new?inv=' + encodeURIComponent(no))}><ReceiptText className="h-4 w-4 mr-1.5" />Record payment</Button>}
          {canVoid && pays.every(p => p.status === 'VOID') && <Button variant="outline" className="text-bad" onClick={() => setVoidOpen(true)}><Ban className="h-4 w-4 mr-1.5" />Void</Button>}
        </>} />
      <div className="grid 2xl:grid-cols-[auto_1fr] gap-6 items-start">
        <div id="inv-print" className="print-area overflow-x-auto"><InvoiceDoc inv={state} lines={lines} s={d.settings} customer={customer} state={state} /></div>
        <div className="space-y-4 no-print">
          {state.emailedAt && <div className="text-sm border rounded-md bg-card px-4 py-3">✉ Emailed {new Date(state.emailedAt).toLocaleString('en-GB')} to <b>{state.emailedTo}</b></div>}
          <Panel title="Payments">
            {state.paidAtInvoice > 0 && <div className="text-sm border-b pb-2 mb-2">Paid at invoicing · {state.payMethod} · <b>{money(state.paidAtInvoice)}</b></div>}
            {pays.length ? pays.map(p => (
              <a key={p.receiptNo} href={'#/receipts/' + encodeURIComponent(p.receiptNo)} className="flex justify-between text-sm py-1.5 hover:underline">
                <span><span className="mono text-xs">{p.receiptNo}</span> · {fmtDate(p.date)} · {p.method} {p.status === 'VOID' && <Tag>VOID</Tag>}</span><b className="tabular">{num(p.amount, 2)}</b>
              </a>
            )) : <div className="text-sm text-muted-foreground">No receipts yet.</div>}
            <div className="flex justify-between border-t mt-2 pt-2 font-semibold"><span>Outstanding</span><span className="tabular">{money(state.outstanding)}</span></div>
          </Panel>
          <Panel title="Next step" sub="Collections follow-up for the Data Hygiene KPIs">
            {ns === null ? (
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">{state.nextStep || <span className="text-muted-foreground">None set</span>}<div className="text-xs text-muted-foreground">Due {fmtDate(state.dueDate)}</div></div>
                {canWrite && <Button size="sm" variant="outline" onClick={() => setNs(state.nextStep)}>Edit</Button>}
              </div>
            ) : (
              <div className="space-y-2">
                <TextInput value={ns} onChange={e => setNs(e.target.value)} placeholder="MM/DD - Call … for payment" />
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={async () => {
                    setBusy(true)
                    try { await api('updateInvoiceNextStep', { invoiceNo: no, nextStep: ns }); await reload(); setNs(null); toast.success('Next step saved') }
                    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
                  }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setNs(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="Journal postings">
            {(d.journal || []).filter(j => j.ref === no).map((j, i) => (
              <div key={i} className="flex text-xs py-1 border-b last:border-0 gap-2">
                <span className="mono w-10">{j.acct}</span><span className="flex-1">{j.acctName}</span>
                <span className="tabular w-20 text-right">{j.debit ? num(j.debit, 2) : ''}</span><span className="tabular w-20 text-right">{j.credit ? num(j.credit, 2) : ''}</span>
              </div>
            ))}
            {!d.journal && <div className="text-xs text-muted-foreground">Accounting access needed to see postings.</div>}
          </Panel>
        </div>
      </div>
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void {no}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This posts a reversing journal entry and marks the invoice VOID. The number is not reused.</p>
          <Field label="Reason"><TextInput value={reason} onChange={e => setReason(e.target.value)} /></Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy || !reason} onClick={async () => {
              setBusy(true)
              try { await api('voidInvoice', { invoiceNo: no, reason }); await reload(); setVoidOpen(false); toast.success('Invoice voided') }
              catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>Void invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
