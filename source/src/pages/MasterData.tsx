import { useMemo, useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { api } from '@/lib/api'
import { invoiceStates } from '@/lib/analytics'
import { num, pct } from '@/lib/fmt'
import type { Customer, Product, Supplier } from '@/lib/types'
import { PageHeader, DataTable, Tag, Field, NativeSelect, TextInput } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Loader2, Trash2 } from 'lucide-react'

// ------------------------------------------------------------------ customers
const blankCustomer = { id: '', name: '', contact: '', phone: '', email: '', address: '', type: 'Retail', vatStatus: 'Non-VAT', tin: '', openingBalance: 0, notes: '' }

export function CustomerDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Customer | null; onSaved?: (c: Customer) => void }) {
  const { reload, data, canWrite } = useApp()
  const [f, setF] = useState<any>(blankCustomer)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF(initial ? { ...initial } : { ...blankCustomer, vatStatus: data?.settings.defaultVatStatus || 'Non-VAT' }) }, [open, initial])
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }))
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{initial ? `Edit ${initial.name}` : 'New customer'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer name *" className="col-span-2"><TextInput value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
          <Field label="Contact person"><TextInput value={f.contact} onChange={e => set({ contact: e.target.value })} /></Field>
          <Field label="Phone"><TextInput value={f.phone} onChange={e => set({ phone: e.target.value })} /></Field>
          <Field label="Email"><TextInput type="email" value={f.email} onChange={e => set({ email: e.target.value })} /></Field>
          <Field label="Customer type"><NativeSelect value={f.type} onChange={e => set({ type: e.target.value })}>{['Retail', 'Wholesale', 'Restaurant', 'Hotel', 'Institution', 'Other'].map(t => <option key={t}>{t}</option>)}</NativeSelect></Field>
          <Field label="Address" className="col-span-2"><TextInput value={f.address} onChange={e => set({ address: e.target.value })} /></Field>
          <Field label="VAT status" hint="Sets the VAT default on new invoices"><NativeSelect value={f.vatStatus} onChange={e => set({ vatStatus: e.target.value })}><option>Non-VAT</option><option>VAT</option></NativeSelect></Field>
          <Field label="TIN / Ghana Card (if any)"><TextInput value={f.tin} onChange={e => set({ tin: e.target.value })} /></Field>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {canWrite && <Button disabled={busy || !f.name} onClick={async () => {
            setBusy(true)
            try { const r = await api('saveCustomer', f); toast.success('Customer saved'); await reload(); onSaved?.(r.customer); onClose() }
            catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Customers() {
  const { data, canWrite, reload } = useApp()
  const d = data!
  const [edit, setEdit] = useState<Customer | null | undefined>(undefined)
  const states = useMemo(() => invoiceStates(d.invoices, d.receipts), [d])
  const rows = (d.customers || []).map(c => {
    const mine = states.filter(s => s.customerName === c.name && s.status !== 'VOID')
    return { ...c, billed: mine.reduce((a, s) => a + s.total, 0), owed: mine.reduce((a, s) => a + s.outstanding, 0), invoices: mine.length }
  })
  return (
    <div>
      <PageHeader title="Customers" sub={`${rows.length} customers · VAT / Non-VAT tagging drives the VAT default on invoices`}
        actions={canWrite && <Button onClick={() => setEdit(null)}><Plus className="h-4 w-4 mr-1.5" />New customer</Button>} />
      <DataTable rows={rows} filename="customers.csv" onRow={r => setEdit(r)} initialSort={{ key: 'name', dir: 'asc' }}
        cols={[
          { key: 'id', label: 'ID', render: r => <span className="mono text-xs">{r.id}</span> },
          { key: 'name', label: 'Customer', render: r => <span className="font-medium">{r.name} {r.isDemo === 'Y' && <Tag tone="DEMO">DEMO</Tag>}</span> },
          { key: 'contact', label: 'Contact' },
          { key: 'phone', label: 'Phone' },
          { key: 'type', label: 'Type' },
          { key: 'vatStatus', label: 'VAT', render: r => <Tag tone={r.vatStatus === 'VAT' ? 'PAID' : undefined}>{r.vatStatus}</Tag> },
          { key: 'invoices', label: 'Invoices', align: 'right' },
          { key: 'billed', label: 'Billed', align: 'right', render: r => num(r.billed, 2) },
          { key: 'owed', label: 'Owes', align: 'right', render: r => <span className={r.owed > 0 ? 'font-semibold text-bad' : ''}>{num(r.owed, 2)}</span> },
          { key: 'del', label: '', render: r => canWrite && !r.invoices ? <button className="text-muted-foreground hover:text-bad" onClick={async e => { e.stopPropagation(); if (!confirm(`Delete ${r.name}?`)) return; try { await api('deleteCustomer', { id: r.id }); await reload(); toast.success('Deleted') } catch (x) { toast.error((x as Error).message) } }}><Trash2 className="h-4 w-4" /></button> : null },
        ]} empty="No customers yet — add your first one." />
      <CustomerDialog open={edit !== undefined} initial={edit} onClose={() => setEdit(undefined)} />
    </div>
  )
}

// ------------------------------------------------------------------ products
export function Products() {
  const { data, canWrite, reload } = useApp()
  const d = data!
  const [edit, setEdit] = useState<Product | null | undefined>(undefined)
  const [f, setF] = useState<any>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (edit !== undefined) setF(edit ? { ...edit, originalCode: edit.code } : { code: '', category: '', name: '', unit: '', supplier: '', cost: '', price: '', vat: 'Y', reorderLevel: 0, active: 'Y', notes: '' }) }, [edit])
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }))
  const po25 = d.products?.find(p => p.code === 'PO-25L')
  return (
    <div>
      <PageHeader title="Products & Pricing" sub="Master price list · margin = selling price − cost price"
        actions={canWrite && <Button onClick={() => setEdit(null)}><Plus className="h-4 w-4 mr-1.5" />New product</Button>} />
      <DataTable rows={d.products || []} filename="products.csv" onRow={r => setEdit(r)}
        cols={[
          { key: 'code', label: 'Code', render: r => <span className="mono text-xs">{r.code}</span> },
          { key: 'category', label: 'Category' },
          { key: 'name', label: 'Product', render: r => <span className="font-medium">{r.name}</span> },
          { key: 'unit', label: 'Unit' },
          { key: 'supplier', label: 'Supplier' },
          { key: 'cost', label: 'Cost (GHS)', align: 'right', render: r => r.cost > 0 ? num(r.cost, 2) : <Tag tone="Needs attention">TBD</Tag> },
          { key: 'price', label: 'Price (GHS)', align: 'right', render: r => num(r.price, 2) },
          { key: 'margin', label: 'Margin', align: 'right', sortValue: r => r.price - r.cost, render: r => r.cost > 0 ? num(r.price - r.cost, 2) : '—' },
          { key: 'marginPct', label: 'Margin %', align: 'right', sortValue: r => (r.price - r.cost) / r.price, render: r => r.cost > 0 ? pct((r.price - r.cost) / r.price) : '—' },
          { key: 'vat', label: 'VAT?' },
          { key: 'active', label: 'Status', render: r => r.active === 'N' ? <Tag>Inactive</Tag> : <Tag tone="ACTIVE">Active</Tag> },
        ]} />
      {po25 && <p className="text-xs text-muted-foreground mt-3">Palm oil bottles are decanted from the 25L bulk container: per-litre cost = GHS {num(po25.cost, 2)} ÷ 25 = GHS {num(po25.cost / 25, 2)}. When the 25L cost changes, update the bottle costs to match (1L, 4L ×4, 5L ×5).</p>}
      <Dialog open={edit !== undefined} onOpenChange={v => !v && setEdit(undefined)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{edit ? `Edit ${edit.name}` : 'New product'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product code *"><TextInput value={f.code || ''} onChange={e => set({ code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Category"><TextInput value={f.category || ''} onChange={e => set({ category: e.target.value })} list="cats" /></Field>
            <datalist id="cats">{[...new Set((d.products || []).map(p => p.category))].map(c => <option key={c} value={c} />)}</datalist>
            <Field label="Product name *" className="col-span-2"><TextInput value={f.name || ''} onChange={e => set({ name: e.target.value })} /></Field>
            <Field label="Unit / pack"><TextInput value={f.unit || ''} onChange={e => set({ unit: e.target.value })} /></Field>
            <Field label="Supplier"><NativeSelect value={f.supplier || ''} onChange={e => set({ supplier: e.target.value })}><option value="">—</option>{(d.suppliers || []).map(s => <option key={s.id}>{s.name}</option>)}</NativeSelect></Field>
            <Field label="Cost price (GHS)"><TextInput type="number" step="0.01" value={f.cost ?? ''} onChange={e => set({ cost: e.target.value })} /></Field>
            <Field label="Selling price (GHS) *"><TextInput type="number" step="0.01" value={f.price ?? ''} onChange={e => set({ price: e.target.value })} /></Field>
            <Field label="VAT applies?"><NativeSelect value={f.vat} onChange={e => set({ vat: e.target.value })}><option value="Y">Yes</option><option value="N">No (exempt)</option></NativeSelect></Field>
            <Field label="Re-order level" hint="Used by the forecast's re-order suggestion"><TextInput type="number" value={f.reorderLevel ?? 0} onChange={e => set({ reorderLevel: e.target.value })} /></Field>
            <Field label="Status"><NativeSelect value={f.active} onChange={e => set({ active: e.target.value })}><option value="Y">Active</option><option value="N">Inactive</option></NativeSelect></Field>
            <Field label="Notes" className="col-span-2"><TextInput value={f.notes || ''} onChange={e => set({ notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            {edit && canWrite && <Button variant="ghost" className="text-bad mr-auto" onClick={async () => { if (!confirm('Delete this product?')) return; try { await api('deleteProduct', { code: edit.code }); await reload(); setEdit(undefined) } catch (x) { toast.error((x as Error).message) } }}>Delete</Button>}
            <Button variant="ghost" onClick={() => setEdit(undefined)}>Cancel</Button>
            {canWrite && <Button disabled={busy} onClick={async () => {
              setBusy(true)
              try { await api('saveProduct', f); toast.success('Product saved'); await reload(); setEdit(undefined) }
              catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ------------------------------------------------------------------ suppliers
export function Suppliers() {
  const { data, canWrite, reload } = useApp()
  const d = data!
  const [edit, setEdit] = useState<Supplier | null | undefined>(undefined)
  const [f, setF] = useState<any>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (edit !== undefined) setF(edit ? { ...edit } : { name: '', products: '', contact: '', phone: '', email: '', address: '', terms: '', notes: '' }) }, [edit])
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }))
  const spend = (name: string) => (d.purchases || []).filter(p => p.supplier === name).reduce((a, p) => a + p.total, 0)
  const credit = (name: string) => (d.purchases || []).filter(p => p.supplier === name && p.method === 'Credit').reduce((a, p) => a + p.total, 0)
  return (
    <div>
      <PageHeader title="Suppliers" actions={canWrite && <Button onClick={() => setEdit(null)}><Plus className="h-4 w-4 mr-1.5" />New supplier</Button>} />
      <DataTable rows={(d.suppliers || []).map(s => ({ ...s, spend: spend(s.name), credit: credit(s.name) }))} filename="suppliers.csv" onRow={r => setEdit(r)}
        cols={[
          { key: 'id', label: 'ID', render: r => <span className="mono text-xs">{r.id}</span> },
          { key: 'name', label: 'Supplier', render: r => <span className="font-medium">{r.name}</span> },
          { key: 'products', label: 'Supplies' },
          { key: 'contact', label: 'Contact', render: r => r.contact || <Tag tone="Needs attention">missing</Tag> },
          { key: 'phone', label: 'Phone', render: r => r.phone || <Tag tone="Needs attention">missing</Tag> },
          { key: 'terms', label: 'Terms' },
          { key: 'spend', label: 'Total bought', align: 'right', render: r => num(r.spend, 2) },
          { key: 'credit', label: 'Bought on credit', align: 'right', render: r => num(r.credit, 2) },
        ]} />
      <Dialog open={edit !== undefined} onOpenChange={v => !v && setEdit(undefined)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{edit ? `Edit ${edit.name}` : 'New supplier'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier name *" className="col-span-2"><TextInput value={f.name || ''} onChange={e => set({ name: e.target.value })} /></Field>
            <Field label="Products supplied" className="col-span-2"><TextInput value={f.products || ''} onChange={e => set({ products: e.target.value })} /></Field>
            <Field label="Contact person"><TextInput value={f.contact || ''} onChange={e => set({ contact: e.target.value })} /></Field>
            <Field label="Phone"><TextInput value={f.phone || ''} onChange={e => set({ phone: e.target.value })} /></Field>
            <Field label="Email"><TextInput value={f.email || ''} onChange={e => set({ email: e.target.value })} /></Field>
            <Field label="Payment terms"><TextInput value={f.terms || ''} onChange={e => set({ terms: e.target.value })} placeholder="e.g. Cash on delivery" /></Field>
            <Field label="Address" className="col-span-2"><TextInput value={f.address || ''} onChange={e => set({ address: e.target.value })} /></Field>
            <Field label="Notes" className="col-span-2"><TextInput value={f.notes || ''} onChange={e => set({ notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(undefined)}>Cancel</Button>
            {canWrite && <Button disabled={busy} onClick={async () => {
              setBusy(true)
              try { await api('saveSupplier', f); toast.success('Supplier saved'); await reload(); setEdit(undefined) }
              catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
