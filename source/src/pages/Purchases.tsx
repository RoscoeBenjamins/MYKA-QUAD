import { useState } from 'react'
import { useApp } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtDate, money, num, todayISO } from '@/lib/fmt'
import { PAY_METHODS } from '@/lib/types'
import { PageHeader, DataTable, Tag, Field, NativeSelect, TextInput, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'

const EXP_CATS = ['Transport', 'Rent', 'Salaries', 'Airtime & Data', 'Utilities', 'Packaging', 'Marketing', 'Bank charges', 'General']

export default function Purchases() {
  const { data, canWrite } = useApp()
  const d = data!
  const [tab, setTab] = useState<'pur' | 'exp'>('pur')
  const [open, setOpen] = useState(false)
  const purTotal = (d.purchases || []).reduce((a, p) => a + p.total, 0)
  const expTotal = (d.expenses || []).reduce((a, p) => a + p.amount, 0)
  return (
    <div>
      <PageHeader title="Purchases & Expenses" sub={`${money(purTotal)} in stock purchases · ${money(expTotal)} in operating expenses`}
        actions={canWrite && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />{tab === 'pur' ? 'Record purchase' : 'Record expense'}</Button>} />
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'pur', label: 'Purchases journal' }, { value: 'exp', label: 'Expenses' }]} /></div>
      {tab === 'pur' ? (
        <DataTable rows={d.purchases || []} filename="purchases-journal.csv" initialSort={{ key: 'date', dir: 'desc' }}
          cols={[
            { key: 'purchaseNo', label: 'Purchase No', render: r => <span className="mono text-xs">{r.purchaseNo}</span> },
            { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
            { key: 'supplier', label: 'Supplier' },
            { key: 'productName', label: 'Product' },
            { key: 'qty', label: 'Qty', align: 'right' },
            { key: 'unitCost', label: 'Unit cost', align: 'right', render: r => num(r.unitCost, 2) },
            { key: 'total', label: 'Total', align: 'right', render: r => num(r.total, 2) },
            { key: 'method', label: 'Paid by', render: r => r.method === 'Credit' ? <Tag tone="PARTIAL">On credit</Tag> : r.method },
            { key: 'notes', label: 'Notes', render: r => <span className="flex gap-1">{r.notes}{r.isDemo === 'Y' && <Tag tone="DEMO">DEMO</Tag>}</span> },
          ]} empty="No purchases recorded yet." />
      ) : (
        <DataTable rows={d.expenses || []} filename="expenses.csv" initialSort={{ key: 'date', dir: 'desc' }}
          cols={[
            { key: 'expenseNo', label: 'Ref', render: r => <span className="mono text-xs">{r.expenseNo}</span> },
            { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
            { key: 'category', label: 'Category' },
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => num(r.amount, 2) },
            { key: 'method', label: 'Paid by' },
            { key: 'createdBy', label: 'By' },
          ]} empty="No expenses recorded yet." />
      )}
      {tab === 'pur' ? <PurchaseDialog open={open} onClose={() => setOpen(false)} /> : <ExpenseDialog open={open} onClose={() => setOpen(false)} />}
    </div>
  )
}

function PurchaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, reload } = useApp()
  const d = data!
  const [f, setF] = useState({ supplier: '', productCode: '', qty: '', unitCost: '', method: 'Cash', date: todayISO(), notes: '', updateCost: false })
  const [busy, setBusy] = useState(false)
  const prods = (d.products || []).filter(p => !f.supplier || p.supplier === f.supplier)
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  const prod = d.products?.find(p => p.code === f.productCode)
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record purchase</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Dr 5100 Purchases · Cr Cash/MoMo/Bank, or Cr 2000 Accounts Payable when bought on credit.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier" className="col-span-2">
            <NativeSelect value={f.supplier} onChange={e => set({ supplier: e.target.value, productCode: '' })}>
              <option value="">— supplier —</option>
              {(d.suppliers || []).map(s => <option key={s.id}>{s.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Product" className="col-span-2">
            <NativeSelect value={f.productCode} onChange={e => { const p = d.products?.find(x => x.code === e.target.value); set({ productCode: e.target.value, unitCost: p?.cost ? String(Math.round(p.cost * 100) / 100) : '' }) }}>
              <option value="">— product —</option>
              {prods.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Quantity"><TextInput type="number" min="0" value={f.qty} onChange={e => set({ qty: e.target.value })} /></Field>
          <Field label="Unit cost (GHS)"><TextInput type="number" min="0" step="0.01" value={f.unitCost} onChange={e => set({ unitCost: e.target.value })} /></Field>
          <Field label="Paid by"><NativeSelect value={f.method} onChange={e => set({ method: e.target.value })}>{[...PAY_METHODS, 'Credit'].map(m => <option key={m} value={m}>{m === 'Credit' ? 'On credit (owe supplier)' : m}</option>)}</NativeSelect></Field>
          <Field label="Date"><TextInput type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></Field>
          <Field label="Notes" className="col-span-2"><TextInput value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
          {prod && Number(f.unitCost) > 0 && Number(f.unitCost) !== Math.round(prod.cost * 100) / 100 && (
            <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox checked={f.updateCost} onCheckedChange={v => set({ updateCost: !!v })} /> Update {prod.name}'s cost price to GHS {f.unitCost}</label>
          )}
        </div>
        <div className="text-right font-bold">Total {money((Number(f.qty) || 0) * (Number(f.unitCost) || 0))}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true)
            try { const r = await api('recordPurchase', { ...f, qty: Number(f.qty), unitCost: Number(f.unitCost) }); toast.success(`${r.purchase.purchaseNo} recorded`); await reload(); onClose(); set({ qty: '', notes: '' }) }
            catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save purchase</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reload } = useApp()
  const [f, setF] = useState({ category: 'Transport', description: '', amount: '', method: 'Cash', date: todayISO() })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record expense</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Dr 6000 Operating Expenses · Cr Cash/MoMo/Bank.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><NativeSelect value={f.category} onChange={e => set({ category: e.target.value })}>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</NativeSelect></Field>
          <Field label="Amount (GHS)"><TextInput type="number" min="0" step="0.01" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
          <Field label="Description" className="col-span-2"><TextInput value={f.description} onChange={e => set({ description: e.target.value })} /></Field>
          <Field label="Paid by"><NativeSelect value={f.method} onChange={e => set({ method: e.target.value })}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</NativeSelect></Field>
          <Field label="Date"><TextInput type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true)
            try { const r = await api('recordExpense', { ...f, amount: Number(f.amount) }); toast.success(`${r.expense.expenseNo} recorded`); await reload(); onClose(); set({ description: '', amount: '' }) }
            catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
