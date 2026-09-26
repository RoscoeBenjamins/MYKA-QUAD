import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { monthlySeries, monthRange, groupSales, invoiceStates } from '@/lib/analytics'
import { addMonths, monthLabel, money, num, pct, todayISO } from '@/lib/fmt'
import { PageHeader, Panel, Stat, Segmented, DataTable, Empty } from '@/components/kit'
import { C, SERIES, grid, axisProps, yMoney, MoneyTooltip } from '@/components/charts'
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, Tooltip, Legend, Cell } from 'recharts'

type Range = '3' | '6' | '12' | 'all'

export default function Trends() {
  const { data } = useApp()
  const d = data!
  const [range, setRange] = useState<Range>('6')
  const today = todayISO()
  const firstData = (d.invoices || []).map(i => i.date).sort()[0] || today
  const startMonth = range === 'all' ? firstData.slice(0, 7) : addMonths(today.slice(0, 7), -(Number(range) - 1))
  const months = monthRange(startMonth, today)
  const prevMonths = monthRange(addMonths(startMonth, -months.length), addMonths(startMonth, -1) + '-28')
  const from = startMonth + '-01'

  const a = useMemo(() => {
    const series = monthlySeries(d, months).map((r, i, arr) => ({
      ...r, label: monthLabel(r.month),
      growth: i > 0 && arr[i - 1].sales ? (r.sales - arr[i - 1].sales) / arr[i - 1].sales : null,
      marginPct: r.sales ? r.grossMargin / r.sales : null,
    }))
    const prev = monthlySeries(d, prevMonths)
    const sum = (xs: typeof prev, k: keyof (typeof prev)[number]) => xs.reduce((s, r) => s + (r[k] as number), 0)
    const lines = (d.invoiceLines || []).filter(l => l.date >= from)
    const invs = (d.invoices || []).filter(i => i.date >= from)
    const byProduct = groupSales(lines, d.invoices, 'productName')
    const byCustomer = groupSales(lines, d.invoices, 'customerName')
    const byCategory = groupSales(lines, d.invoices, 'category', d.products)
    const productNames = byProduct.slice(0, 5).map(p => p.name)
    const productMonthly = months.map(m => {
      const row: Record<string, any> = { label: monthLabel(m) }
      productNames.forEach(n => { row[n] = 0 })
      lines.forEach(l => { if (l.date.startsWith(m) && productNames.includes(l.productName)) row[l.productName] += l.lineTotal })
      return row
    })
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(n => ({ label: n, sales: 0, count: 0 }))
    invs.filter(i => i.status !== 'VOID').forEach(i => { const w = new Date(i.date + 'T12:00:00Z').getUTCDay(); weekday[w].sales += i.subtotal; weekday[w].count++ })
    const states = invoiceStates(d.invoices, d.receipts)
    const buckets = [
      { label: 'Not yet due', v: 0 }, { label: '1–30 days', v: 0 }, { label: '31–60 days', v: 0 }, { label: '61–90 days', v: 0 }, { label: '90+ days', v: 0 },
    ]
    states.forEach(s => {
      if (s.outstanding <= 0) return
      const o = s.daysOverdue
      buckets[o <= 0 ? 0 : o <= 30 ? 1 : o <= 60 ? 2 : o <= 90 ? 3 : 4].v += s.outstanding
    })
    const cur = { sales: sum(series as any, 'sales'), receipts: sum(series as any, 'receipts'), margin: sum(series as any, 'grossMargin'), invoices: sum(series as any, 'invoices'), grossSales: sum(series as any, 'grossSales') }
    const prevSales = sum(prev, 'sales')
    return { series, cur, prevSales, byProduct, byCustomer, byCategory, productNames, productMonthly, weekday, buckets }
  }, [d, range])

  if (!(d.invoices || []).length) return (
    <div><PageHeader title="Trend Analysis" /><Empty title="No sales yet">Trends appear once invoices are recorded. An admin can load demo data from Admin → Demo data to preview this page.</Empty></div>
  )
  const growth = a.prevSales ? (a.cur.sales - a.prevSales) / a.prevSales : null
  const topCust = a.byCustomer[0]
  const custShare = topCust && a.cur.sales ? topCust.sales / a.cur.sales : 0
  return (
    <div>
      <PageHeader title="Trend Analysis" sub="Sales, margin, cash collection and mix over time — all figures ex-VAT unless noted"
        actions={<Segmented value={range} onChange={setRange} options={[{ value: '3', label: '3M' }, { value: '6', label: '6M' }, { value: '12', label: '12M' }, { value: 'all', label: 'All' }]} />} />
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Stat label="Sales (period)" value={money(a.cur.sales)} sub={growth === null ? 'No prior period' : `${growth >= 0 ? '▲' : '▼'} ${pct(Math.abs(growth))} vs previous ${months.length} mo`} tone={growth === null ? 'brand' : growth >= 0 ? 'ok' : 'bad'} />
        <Stat label="Gross margin" value={a.cur.sales ? pct(a.cur.margin / a.cur.sales) : '—'} sub={money(a.cur.margin)} />
        <Stat label="Avg invoice" value={money(a.cur.invoices ? a.cur.sales / a.cur.invoices : 0)} sub={`${num(a.cur.invoices)} invoices`} />
        <Stat label="Collection rate" value={a.cur.grossSales ? pct(Math.min(1, a.cur.receipts / a.cur.grossSales)) : '—'} sub="Cash in ÷ billed (incl. VAT)" tone="ok" />
        <Stat label="Top customer share" value={pct(custShare)} sub={topCust?.name} tone={custShare > 0.4 ? 'warn' : 'brand'} />
      </div>

      <Panel title="Revenue, margin & cash" sub="Bars = sales ex-VAT · green area = gross margin · orange line = cash collected" className="mt-4">
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={a.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {grid}<XAxis dataKey="label" {...axisProps} /><YAxis {...yMoney} />
              <Tooltip content={<MoneyTooltip />} /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales" name="Sales" fill={C.green} fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Area dataKey="grossMargin" name="Gross margin" stroke={C.green} fill={C.green} fillOpacity={0.25} strokeWidth={2} />
              <Line dataKey="receipts" name="Cash collected" stroke={C.flame} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid xl:grid-cols-2 gap-4 mt-4">
        <Panel title="Month-over-month growth" sub="Change in sales vs the previous month">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={a.series.slice(1)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}<XAxis dataKey="label" {...axisProps} /><YAxis {...axisProps} tickFormatter={v => `${Math.round(v * 100)}%`} width={44} />
                <Tooltip formatter={(v: any) => (v === null ? '—' : pct(Number(v)))} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="growth" name="Growth" radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {a.series.slice(1).map((r, i) => <Cell key={i} fill={(r.growth || 0) >= 0 ? C.green : C.rose} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Product mix over time" sub="Top 5 products by sales">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={a.productMonthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}<XAxis dataKey="label" {...axisProps} /><YAxis {...yMoney} />
                <Tooltip content={<MoneyTooltip />} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                {a.productNames.map((n, i) => <Bar key={n} dataKey={n} stackId="p" fill={SERIES[i % SERIES.length]} maxBarSize={40} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Receivables ageing" sub="Money still owed, by how late it is">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={a.buckets} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <XAxis type="number" {...axisProps} tickFormatter={v => num(v)} /><YAxis type="category" dataKey="label" {...axisProps} width={84} />
                <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="v" name="Outstanding" radius={[0, 3, 3, 0]} maxBarSize={22}>
                  {a.buckets.map((_, i) => <Cell key={i} fill={[C.green, C.olive, C.flame, C.rose, C.rose][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Sales by weekday" sub="Which days bring in the most business">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={a.weekday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}<XAxis dataKey="label" {...axisProps} /><YAxis {...yMoney} />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="sales" name="Sales" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-2 gap-4 mt-4">
        <Panel title="Product performance">
          <DataTable searchable={false} rows={a.byProduct} filename="product-trends.csv" cols={[
            { key: 'name', label: 'Product' },
            { key: 'qty', label: 'Qty', align: 'right', render: r => num(r.qty) },
            { key: 'sales', label: 'Sales', align: 'right', render: r => num(r.sales, 2) },
            { key: 'margin', label: 'Margin', align: 'right', render: r => r.cogs ? num(r.margin, 2) : '—' },
            { key: 'mpct', label: 'Margin %', align: 'right', sortValue: r => r.sales ? r.margin / r.sales : 0, render: r => r.cogs ? pct(r.margin / r.sales) : 'no cost' },
            { key: 'share', label: 'Share', align: 'right', sortValue: r => r.sales, render: r => pct(r.sales / (a.cur.sales || 1)) },
          ]} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {a.byCategory.map((c, i) => <span key={c.name} className="flex items-center gap-1.5 border rounded px-2 py-1"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i % 5] }} />{c.name}: <b>{pct(c.sales / (a.cur.sales || 1))}</b></span>)}
          </div>
        </Panel>
        <Panel title="Top customers">
          <DataTable searchable={false} rows={a.byCustomer} filename="customer-trends.csv" pageSize={10} cols={[
            { key: 'name', label: 'Customer' },
            { key: 'count', label: 'Lines', align: 'right' },
            { key: 'sales', label: 'Sales', align: 'right', render: r => num(r.sales, 2) },
            { key: 'share', label: 'Share', align: 'right', sortValue: r => r.sales, render: r => pct(r.sales / (a.cur.sales || 1)) },
          ]} />
        </Panel>
      </div>
    </div>
  )
}
