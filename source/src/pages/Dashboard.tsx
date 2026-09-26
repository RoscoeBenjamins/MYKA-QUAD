import { useMemo, useState } from 'react'
import { useApp, go } from '@/lib/store'
import { invoiceStates, monthlySeries, monthRange, groupSales, trialBalance } from '@/lib/analytics'
import { money, num, fmtDate, todayISO, addMonths, monthLabel } from '@/lib/fmt'
import { PageHeader, Panel, Stat, Tag, Segmented, DataTable } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { C, grid, axisProps, yMoney, MoneyTooltip } from '@/components/charts'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { FilePlus2, ReceiptText, ShoppingCart, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

type Period = 'month' | 'year' | 'all'

export default function Dashboard() {
  const { data, can, reload, canWrite } = useApp()
  const [period, setPeriod] = useState<Period>('all')
  const d = data!
  const today = todayISO()
  const from = period === 'month' ? today.slice(0, 7) + '-01' : period === 'year' ? today.slice(0, 4) + '-01-01' : '0000'
  const inRange = <T extends { date: string }>(xs: T[] = []) => xs.filter(x => x.date >= from && x.date <= today + 'z')

  const m = useMemo(() => {
    const invs = inRange(d.invoices).filter(i => i.status !== 'VOID')
    const states = invoiceStates(d.invoices, d.receipts)
    const rcpts = inRange(d.receipts).filter(r => r.status !== 'VOID')
    const tb = trialBalance(d.accounts, d.journal)
    const dr = tb.reduce((a, r) => a + r.debit, 0), cr = tb.reduce((a, r) => a + r.credit, 0)
    return {
      sales: invs.reduce((a, i) => a + i.total, 0),
      vat: invs.reduce((a, i) => a + i.vat, 0),
      receipts: rcpts.reduce((a, r) => a + r.amount, 0) + invs.reduce((a, i) => a + i.paidAtInvoice, 0),
      outstanding: states.reduce((a, s) => a + s.outstanding, 0),
      overdue: states.filter(s => s.daysOverdue > 0),
      invCount: invs.length, rctCount: rcpts.length,
      purchases: inRange(d.purchases).reduce((a, p) => a + p.total, 0),
      expenses: inRange(d.expenses).reduce((a, p) => a + p.amount, 0),
      tbOk: Math.abs(dr - cr) < 0.01, tbDiff: dr - cr,
      states,
    }
  }, [d, period])

  const months = monthRange(addMonths(today.slice(0, 7), -5), today)
  const series = monthlySeries(d, months).map(r => ({ ...r, label: monthLabel(r.month) }))
  const byProduct = groupSales(inRange(d.invoiceLines), d.invoices, 'productName')
  const cur = d.settings.currency || 'GHS'
  const demo = (d.invoices || []).some(i => i.isDemo === 'Y')

  return (
    <div>
      <PageHeader title={`${d.settings.companyName} — Dashboard`}
        sub={<>As of {fmtDate(today)}{demo && <> · <Tag tone="DEMO">Demo data loaded</Tag></>}</>}
        actions={<>
          {can('sales') && canWrite && <Button onClick={() => go('/invoices/new')}><FilePlus2 className="h-4 w-4 mr-1.5" />Record invoice</Button>}
          {can('sales') && canWrite && <Button variant="outline" onClick={() => go('/receipts/new')}><ReceiptText className="h-4 w-4 mr-1.5" />Record receipt</Button>}
          {can('purchases') && canWrite && <Button variant="outline" onClick={() => go('/purchases')}><ShoppingCart className="h-4 w-4 mr-1.5" />Purchase</Button>}
          <Button variant="ghost" onClick={async () => { await reload(); toast.success('Dashboard refreshed') }}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
        </>} />
      <div className="mb-4"><Segmented value={period} onChange={setPeriod} options={[{ value: 'month', label: 'This month' }, { value: 'year', label: 'This year' }, { value: 'all', label: 'All time' }]} /></div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={`Total sales (${cur})`} value={money(m.sales, '')} sub={`${m.invCount} invoice${m.invCount === 1 ? '' : 's'}`} />
        <Stat label={`VAT collected (${cur})`} value={money(m.vat, '')} sub={`Rate ${(Number(d.settings.vatRate) * 100).toFixed(1)}%`} />
        <Stat label={`Total receipts (${cur})`} value={money(m.receipts, '')} sub={`${m.rctCount} receipt${m.rctCount === 1 ? '' : 's'}`} tone="ok" />
        <Stat label={`Outstanding A/R (${cur})`} value={money(m.outstanding, '')} sub={`${m.overdue.length} overdue`} tone={m.overdue.length ? 'warn' : 'ok'} />
        <Stat label={`Purchases (${cur})`} value={money(m.purchases, '')} />
        <Stat label={`Expenses (${cur})`} value={money(m.expenses, '')} />
        <Stat label="Gross surplus" value={money(m.sales - m.vat - m.purchases - m.expenses, '')} sub="Sales ex-VAT − purchases − expenses" tone={m.sales - m.vat - m.purchases - m.expenses >= 0 ? 'ok' : 'bad'} />
        {d.journal
          ? <Stat label="Trial balance check" value={m.tbOk ? 'Balanced' : 'Out by ' + num(m.tbDiff, 2)} sub="Debits = credits" tone={m.tbOk ? 'ok' : 'bad'} />
          : <Stat label="Customers" value={num(d.customers?.length)} />}
      </div>

      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4 mt-4">
        <Panel title="Sales vs cash collected" sub="Last 6 months · bars = sales ex-VAT, line = receipts">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...yMoney} />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="sales" name="Sales" fill={C.green} radius={[3, 3, 0, 0]} maxBarSize={36} />
                <Line dataKey="receipts" name="Receipts" stroke={C.flame} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Sales by product" sub={period === 'all' ? 'All time' : period === 'year' ? 'This year' : 'This month'}>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground text-left"><th className="pb-2">Product</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Sales</th></tr></thead>
            <tbody>
              {(d.products || []).map(p => {
                const r = byProduct.find(b => b.name === p.name)
                const max = Math.max(1, ...byProduct.map(b => b.sales))
                return (
                  <tr key={p.code} className="border-t">
                    <td className="py-1.5 pr-2">
                      <div>{p.name}</div>
                      <div className="h-1 mt-1 rounded bg-muted overflow-hidden"><div className="h-full bg-brand" style={{ width: `${((r?.sales || 0) / max) * 100}%` }} /></div>
                    </td>
                    <td className="py-1.5 text-right tabular">{num(r?.qty)}</td>
                    <td className="py-1.5 text-right tabular">{num(r?.sales, 2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      {d.invoices && (
        <div className="grid xl:grid-cols-2 gap-4 mt-4">
          <Panel title="Recent invoices">
            <DataTable searchable={false} pageSize={8} rows={[...m.states].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))}
              onRow={r => go('/invoices/' + r.invoiceNo)}
              cols={[
                { key: 'invoiceNo', label: 'Invoice', render: r => <span className="mono text-xs">{r.invoiceNo}</span> },
                { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
                { key: 'customerName', label: 'Customer' },
                { key: 'total', label: 'Total', align: 'right', render: r => num(r.total, 2) },
                { key: 'payStatus', label: 'Status', render: r => <Tag>{r.payStatus}</Tag> },
              ]} empty="No invoices yet — record your first one." />
          </Panel>
          <Panel title="Overdue — chase these" sub="Past the due date with money still owed">
            <DataTable searchable={false} pageSize={8} rows={m.overdue} initialSort={{ key: 'daysOverdue', dir: 'desc' }}
              onRow={r => go('/invoices/' + r.invoiceNo)}
              cols={[
                { key: 'invoiceNo', label: 'Invoice', render: r => <span className="mono text-xs">{r.invoiceNo}</span> },
                { key: 'customerName', label: 'Customer' },
                { key: 'daysOverdue', label: 'Days late', align: 'right' },
                { key: 'outstanding', label: 'Owed', align: 'right', render: r => num(r.outstanding, 2) },
              ]} empty="Nothing overdue." />
          </Panel>
        </div>
      )}
    </div>
  )
}
