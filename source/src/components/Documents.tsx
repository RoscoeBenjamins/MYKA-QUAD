import { useState } from 'react'
import type { Invoice, InvoiceLine, Receipt, Settings, Customer } from '@/lib/types'
import type { InvoiceState } from '@/lib/analytics'
import { LOGO } from '@/lib/logo'
import { fmtDate, num } from '@/lib/fmt'
import { Button } from '@/components/ui/button'
import { Printer, Download, Loader2, Mail, Send } from 'lucide-react'
import { useApp } from '@/lib/store'
import { api } from '@/lib/api'
import { Field, TextInput } from '@/components/kit'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import html2pdf from 'html2pdf.js'

function Letterhead({ s, title, no, date, tone = '#0b5d0b' }: { s: Settings; title: string; no: string; date: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${tone}`, paddingBottom: 12, marginBottom: 16 }}>
      <div>
        <img src={LOGO} alt="Myka" style={{ height: 52, marginBottom: 6 }} />
        <div style={{ fontWeight: 800, fontSize: 15 }}>{s.companyName}</div>
        <div>{s.address}</div>
        <div>Email: {s.email} · Tel: {s.phone}</div>
        <div>MoMo: {s.momo} · {s.bankName} — Acct No: {s.bankAccount}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1, color: tone }}>{title}</div>
        <table style={{ width: 'auto', marginLeft: 'auto', marginTop: 6 }}>
          <tbody>
            <tr><td style={{ border: 0, padding: '2px 8px', color: '#666' }}>No.</td><td style={{ border: 0, padding: '2px 0', fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>{no}</td></tr>
            <tr><td style={{ border: 0, padding: '2px 8px', color: '#666' }}>Date</td><td style={{ border: 0, padding: '2px 0', fontWeight: 600 }}>{fmtDate(date)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function InvoiceDoc({ inv, lines, s, customer, state }: { inv: Invoice; lines: InvoiceLine[]; s: Settings; customer?: Customer; state?: InvoiceState }) {
  const rate = Number(s.vatRate) * 100
  const received = state?.received || 0
  const balance = state ? state.outstanding : inv.total - inv.paidAtInvoice
  return (
    <div className="doc-sheet shadow-lg mx-auto relative">
      {inv.status === 'VOID' && <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center', fontSize: 110, fontWeight: 900, color: 'rgba(200,0,0,0.12)', transform: 'rotate(-18deg)' }}>VOID</div>}
      {inv.isDemo === 'Y' && <div style={{ background: '#fff4e0', border: '1px solid #f0b060', padding: '4px 8px', marginBottom: 8, fontSize: 10 }}>DEMO DOCUMENT — sample data, not a real invoice</div>}
      <Letterhead s={s} title={inv.vatApplied === 'Y' ? 'TAX INVOICE' : 'INVOICE'} no={inv.invoiceNo} date={inv.date} />
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div style={{ flex: 1, background: '#f6f4ee', padding: 10 }}>
          <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 1 }}>BILL TO</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{inv.customerName}</div>
          {customer?.contact && <div>Attn: {customer.contact}</div>}
          {customer?.address && <div>{customer.address}</div>}
          {customer?.phone && <div>Tel: {customer.phone}</div>}
          {customer?.tin && <div>TIN: {customer.tin}</div>}
        </div>
        <div style={{ width: 200, background: '#f6f4ee', padding: 10 }}>
          <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 1 }}>TERMS</div>
          <div>Due date: <b>{fmtDate(inv.dueDate)}</b></div>
          <div>Customer VAT status: {customer?.vatStatus || '—'}</div>
          <div>VAT applied: {inv.vatApplied === 'Y' ? 'Yes' : 'No'}</div>
        </div>
      </div>
      <table>
        <thead><tr><th style={{ width: 28 }}>#</th><th>Product</th><th>Unit</th><th className="num">Qty</th><th className="num">Unit Price (GHS)</th><th className="num">Line Total (GHS)</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}><td>{i + 1}</td><td>{l.productName}</td><td>{l.unit}</td><td className="num">{num(l.qty)}</td><td className="num">{num(l.unitPrice, 2)}</td><td className="num">{num(l.lineTotal, 2)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <table style={{ width: 290 }}>
          <tbody>
            <tr><td>Subtotal</td><td className="num">{num(inv.subtotal, 2)}</td></tr>
            <tr><td>VAT {inv.vatApplied === 'Y' ? `(${rate.toFixed(1)}%)` : ''}</td><td className="num">{num(inv.vat, 2)}</td></tr>
            <tr style={{ background: '#0b5d0b', color: '#fff', fontWeight: 800, fontSize: 13 }}><td style={{ borderBottom: 0 }}>GRAND TOTAL (GHS)</td><td className="num" style={{ borderBottom: 0 }}>{num(inv.total, 2)}</td></tr>
            <tr><td>Amount paid</td><td className="num">{num(inv.paidAtInvoice + received, 2)}</td></tr>
            <tr style={{ fontWeight: 700 }}><td>Balance due</td><td className="num">{num(balance, 2)}</td></tr>
            {state && <tr><td>Payment status</td><td className="num" style={{ fontWeight: 700 }}>{state.payStatus}</td></tr>}
          </tbody>
        </table>
      </div>
      {inv.notes && <div style={{ marginTop: 12 }}><b>Notes:</b> {inv.notes}</div>}
      <div style={{ marginTop: 24, padding: 10, border: '1px dashed #c9c3b3', textAlign: 'center' }}>
        Payment: MoMo <b>{s.momo}</b> &nbsp;|&nbsp; {s.bankName} <b>{s.bankAccount}</b> &nbsp;|&nbsp; Please quote <b>{inv.invoiceNo}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
        <div>Prepared by: ______________________ <div style={{ color: '#888', fontSize: 10 }}>{inv.createdBy}</div></div>
        <div>Received by: ______________________</div>
      </div>
      <div style={{ position: 'absolute', bottom: '10mm', left: '14mm', right: '14mm', textAlign: 'center', color: '#999', fontSize: 9 }}>Thank you for your business — {s.companyName}</div>
    </div>
  )
}

export function ReceiptDoc({ r, s, inv, outstandingAfter }: { r: Receipt; s: Settings; inv?: Invoice; outstandingAfter?: number }) {
  return (
    <div className="doc-sheet shadow-lg mx-auto relative" style={{ minHeight: '148mm' }}>
      {r.status === 'VOID' && <div style={{ position: 'absolute', top: '35%', left: 0, right: 0, textAlign: 'center', fontSize: 90, fontWeight: 900, color: 'rgba(200,0,0,0.12)', transform: 'rotate(-14deg)' }}>VOID</div>}
      {r.isDemo === 'Y' && <div style={{ background: '#fff4e0', border: '1px solid #f0b060', padding: '4px 8px', marginBottom: 8, fontSize: 10 }}>DEMO DOCUMENT — sample data, not a real receipt</div>}
      <Letterhead s={s} title="PAYMENT RECEIPT" no={r.receiptNo} date={r.date} tone="#b85c00" />
      <table style={{ fontSize: 13 }}>
        <tbody>
          <tr><td style={{ width: 220, color: '#666' }}>Received from</td><td style={{ fontWeight: 700 }}>{r.customerName}</td></tr>
          <tr><td style={{ color: '#666' }}>Against invoice</td><td className="mono">{r.invoiceNo}{inv ? ` (dated ${fmtDate(inv.date)}, total GHS ${num(inv.total, 2)})` : ''}</td></tr>
          <tr><td style={{ color: '#666' }}>Payment method</td><td>{r.method}</td></tr>
          <tr><td style={{ color: '#666' }}>Amount received</td><td style={{ fontWeight: 800, fontSize: 18 }}>GHS {num(r.amount, 2)}</td></tr>
          {outstandingAfter !== undefined && <tr><td style={{ color: '#666' }}>Balance remaining on invoice</td><td style={{ fontWeight: 700 }}>GHS {num(outstandingAfter, 2)}</td></tr>}
          {r.notes && <tr><td style={{ color: '#666' }}>Notes</td><td>{r.notes}</td></tr>}
        </tbody>
      </table>
      <div style={{ marginTop: 20, padding: 10, border: '1px dashed #c9c3b3', textAlign: 'center' }}>
        Received with thanks — {s.companyName} &nbsp;|&nbsp; MoMo {s.momo} &nbsp;|&nbsp; {s.bankName} {s.bankAccount}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 44 }}>
        <div>Received by: ______________________ <div style={{ color: '#888', fontSize: 10 }}>{r.receivedBy || r.createdBy}</div></div>
        <div>Customer signature: ______________________</div>
      </div>
    </div>
  )
}

/** Renders the on-screen document to an A4 PDF. mode 'save' downloads it; 'base64' returns the data URI. */
export async function renderPdf(targetId: string, filename: string, mode: 'save' | 'base64'): Promise<string | void> {
  const el = document.getElementById(targetId)?.querySelector('.doc-sheet') as HTMLElement | null
  if (!el) throw new Error('Document not found on the page.')
  const shadow = el.style.boxShadow; const mh = el.style.minHeight
  el.style.boxShadow = 'none'; if (!mh) el.style.minHeight = '290mm'
  try {
    const worker = html2pdf().set({
      margin: 0, filename, image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }, pagebreak: { mode: 'avoid-all' },
    } as any).from(el)
    if (mode === 'save') { await worker.save(); return }
    return await worker.outputPdf('datauristring')
  } finally { el.style.boxShadow = shadow; el.style.minHeight = mh }
}

export function DocActions({ targetId, filename }: { targetId: string; filename: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
      <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await renderPdf(targetId, filename, 'save') } finally { setBusy(false) }
      }}>{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}Download PDF</Button>
    </>
  )
}

export function EmailDocButton({ kind, no, targetId, defaultTo, customerName, summary, emailedAt, emailedTo, disabled }: {
  kind: 'invoice' | 'receipt'; no: string; targetId: string; defaultTo: string; customerName: string; summary: string
  emailedAt?: string; emailedTo?: string; disabled?: boolean
}) {
  const { data, reload } = useApp()
  const s = data!.settings
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState(''); const [cc, setCc] = useState(''); const [subject, setSubject] = useState(''); const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const openDialog = () => {
    setTo(defaultTo || ''); setCc('')
    setSubject(`${kind === 'invoice' ? 'Invoice' : 'Receipt'} ${no} from ${s.companyName}`)
    setMessage(kind === 'invoice'
      ? `Dear ${customerName},\n\nPlease find attached invoice ${no} (${summary}).\n\nThank you for your business.`
      : `Dear ${customerName},\n\nThank you for your payment. Please find attached receipt ${no} (${summary}).`)
    setOpen(true)
  }
  return (
    <>
      <Button disabled={disabled} onClick={openDialog}><Mail className="h-4 w-4 mr-1.5" />{emailedAt ? 'Email again' : 'Email to customer'}</Button>
      <Dialog open={open} onOpenChange={v => !busy && setOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Email {kind} {no}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Sent from <b>{s.emailSenderName || s.companyName} &lt;{s.emailFrom || s.email}&gt;</b> with the {kind} attached as a PDF. Replies go to {s.emailReplyTo || s.emailFrom}.</p>
          {emailedAt && <p className="text-xs bg-accent text-accent-foreground rounded px-2 py-1">Already emailed {new Date(emailedAt).toLocaleString('en-GB')} to {emailedTo}</p>}
          <div className="space-y-3">
            <Field label="To" hint={!defaultTo ? 'No email saved for this customer — add it on the Customers page to prefill next time.' : 'Separate several addresses with commas'}><TextInput type="email" multiple value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" /></Field>
            <Field label="CC (optional)"><TextInput value={cc} onChange={e => setCc(e.target.value)} /></Field>
            <Field label="Subject"><TextInput value={subject} onChange={e => setSubject(e.target.value)} /></Field>
            <Field label="Message"><Textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !to.trim()} onClick={async () => {
              setBusy(true)
              try {
                const pdf = await renderPdf(targetId, `${no}.pdf`, 'base64')
                await api('emailDocument', { kind, no, to, cc, subject, message, pdfBase64: pdf })
                toast.success(`${kind === 'invoice' ? 'Invoice' : 'Receipt'} ${no} emailed to ${to}`)
                setOpen(false); await reload()
              } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
            }}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}{busy ? 'Sending…' : 'Send email'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
