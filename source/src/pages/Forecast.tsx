import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { monthlySeries, monthRange, forecastSeries, type ForecastMethod } from '@/lib/analytics'
import { monthLabel, money, num, pct, todayISO, addMonths } from '@/lib/fmt'
import { PageHeader, Panel, Stat, Segmented, DataTable, Empty, Field, NativeSelect } from '@/components/kit'
import { C, grid, axisProps, yMoney, MoneyTooltip } from '@/components/charts'
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts'
import { Slider } from '@/components/ui/slider'

type Metric = 'sales' | 'receipts' | 'grossMargin' | 'purchases' | 'expenses' | 'qty'
const METRICS: { value: Metric; label: string }[] = [
  { value: 'sales', label: 'Sales (ex-VAT)' }, { value: 'receipts', label: 'Cash collected' }, { value: 'grossMargin', label: 'Gross margin' },
  { value: 'purchases', label: 'Purchases' }, { value: 'expenses', label: 'Expenses' }, { value: 'qty', label: 'Units sold' },
]
const METHOD_LABEL: Record<string, string> = { holt: "Holt's linear trend (double exponential smoothing)", linear: 'Linear regression', average: '3-month moving average' }

export default function Forecast() {
  const { data } = useApp()
  const d = data!
  const [metric, setMetric] = useState<Metric>('sales')
  const [horizon, setHorizon] = useState<'3' | '6' | '12'>('6')
  const [method, setMethod] = useState<ForecastMethod | 'auto'>('auto')
  const [adj, setAdj] = useState(0)
  const today = todayISO()
  const curMonth = today.slice(0, 7)
  const first = (d.invoices || []).map(i => i.date).sort()[0]

  const res = useMemo(() => {
    if (!first) return null
    // use complete months only — the current month is partial and would drag the trend down
    const months = monthRange(first, addMonths(curMonth, -1) + '-01')
    if (months.length < 1) return null
    const series = monthlySeries(d, months)
    const f = forecastSeries(months, series.map(r => r[metric] as number), Number(horizon), method)
    const points = f.points.map(p => p.forecast !== undefined && p.actual === undefined
      ? { ...p, forecast: p.forecast * (1 + adj / 100), lo: (p.lo || 0) * (1 + adj / 100), hi: (p.hi || 0) * (1 + adj / 100) } : p)
    // per-product demand next month
    const products = (d.products || []).filter(p => p.active !== 'N').map(p => {
      const qty = months.map(m => (d.invoiceLines || []).filter(l => l.productCode === p.code && l.date.startsWith(m)).reduce((a, l) => a + l.qty, 0))
      const pf = forecastSeries(months, qty, 1, 'auto')
      const next = Math.max(0, Math.round((pf.points[pf.points.length - 1].forecast || 0) * (1 + adj / 100)))
      return { code: p.code, name: p.name, unit: p.unit, last: qty[qty.length - 1] || 0, avg3: qty.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, qty.length || 1), next, revenue: next * p.price, cost: next * p.cost, method: pf.method }
    })
    // palm oil bottles all come from 25L bulk
    const litres = products.reduce((a, p) => { const m = /^PO-(\d+)L$/.exec(p.code); return a + (m ? Number(m[1]) * p.next : 0) }, 0)
    // cash projection
    const fc = (k: Metric) => forecastSeries(months, series.map(r => r[k] as number), Number(horizon), 'auto').points.filter(p => p.actual === undefined).map(p => (p.forecast || 0) * (1 + adj / 100))
    const inflow = fc('receipts'), outP = forecastSeries(months, series.map(r => r.purchases), Number(horizon), 'auto').points.filter(p => p.actual === undefined).map(p => p.forecast || 0)
    const outE = forecastSeries(months, series.map(r => r.expenses), Number(horizon), 'auto').points.filter(p => p.actual === undefined).map(p => p.forecast || 0)
    let cum = 0
    const cash = points.filter(p => p.actual === undefined).map((p, i) => { const net = inflow[i] - outP[i] - outE[i]; cum += net; return { month: p.month, inflow: inflow[i], purchases: outP[i], expenses: outE[i], net, cum } })
    return { ...f, points, months, products, litres, cash }
  }, [d, metric, horizon, method, adj])

  if (!res) return <div><PageHeader title="Forecast" /><Empty title="Not enough history yet">Forecasts need at least one complete month of invoices. An admin can load demo data to preview this page.</Empty></div>
  const fut = res.points.filter(p => p.actual === undefined)
  const total = fut.reduce((a, p) => a + (p.forecast || 0), 0)
  const isQty = metric === 'qty'
  const fmt = (v: number) => (isQty ? num(v) : money(v))
  const chart = res.points.map(p => ({ ...p, label: monthLabel(p.month), band: p.lo !== undefined ? [p.lo, p.hi] : undefined }))
  return (
    <div>
      <PageHeader title="Forecast" sub="Projections from complete months of history · the best-fitting model is picked automatically by back-testing" />
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <Field label="What to forecast" className="w-52"><NativeSelect value={metric} onChange={e => setMetric(e.target.value as Metric)}>{METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</NativeSelect></Field>
        <Field label="Horizon"><Segmented value={horizon} onChange={setHorizon} options={[{ value: '3', label: '3 mo' }, { value: '6', label: '6 mo' }, { value: '12', label: '12 mo' }]} /></Field>
        <Field label="Model"><Segmented value={method} onChange={setMethod} options={[{ value: 'auto', label: 'Auto' }, { value: 'holt', label: 'Holt' }, { value: 'linear', label: 'Linear' }, { value: 'average', label: 'Moving avg' }]} /></Field>
        <Field label={`Scenario adjustment: ${adj > 0 ? '+' : ''}${adj}%`} className="w-56"><Slider min={-30} max={30} step={5} value={[adj]} onValueChange={v => setAdj(v[0])} className="mt-3" /></Field>
      </div>
      {!res.enoughData && <div className="mb-4 text-sm bg-accent text-accent-foreground border border-flame/30 rounded px-3 py-2">Only {res.months.length} complete month{res.months.length === 1 ? '' : 's'} of history — treat this as a rough guide until there are at least 4 months.</div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={`Next month (${monthLabel(fut[0].month)})`} value={fmt(fut[0].forecast || 0)} sub={`Range ${fmt(fut[0].lo || 0)} – ${fmt(fut[0].hi || 0)}`} />
        <Stat label={`Next ${horizon} months total`} value={fmt(total)} />
        <Stat label="Trend" value={`${res.growth >= 0 ? '▲' : '▼'} ${pct(Math.abs(res.growth))}`} sub="Next month vs last complete month" tone={res.growth >= 0 ? 'ok' : 'warn'} />
        <Stat label="Model accuracy" value={res.mape === null ? '—' : pct(Math.max(0, 1 - res.mape), 0)} sub={`${res.method === 'holt' ? 'Holt' : res.method === 'linear' ? 'Linear' : 'Moving avg'} · avg error ${res.mape === null ? '—' : pct(res.mape, 0)}`} />
      </div>
      <Panel title={`${METRICS.find(m => m.value === metric)!.label} — actual vs forecast`} sub={`${METHOD_LABEL[res.method]} · shaded band ≈ 80% range`} className="mt-4">
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {grid}<XAxis dataKey="label" {...axisProps} /><YAxis {...(isQty ? axisProps : yMoney)} />
              <Tooltip content={<MoneyTooltip />} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="band" name="Likely range" stroke="none" fill={C.flame} fillOpacity={0.15} unit={isQty ? 'qty' : undefined} />
              <Line dataKey="actual" name="Actual" stroke={C.green} strokeWidth={2.5} dot={{ r: 3 }} unit={isQty ? 'qty' : undefined} />
              <Line dataKey="fitted" name="Model fit" stroke={C.axis} strokeDasharray="2 3" dot={false} unit={isQty ? 'qty' : undefined} />
              <Line dataKey="forecast" name="Forecast" stroke={C.flame} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} unit={isQty ? 'qty' : undefined} />
              <ReferenceLine x={monthLabel(res.months[res.months.length - 1])} stroke={C.axis} strokeDasharray="3 3" label={{ value: 'today', fontSize: 10, fill: C.axis, position: 'insideTopRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="grid xl:grid-cols-2 gap-4 mt-4">
        <Panel title="Demand & re-order plan — next month" sub={`Palm oil needed: ${num(res.litres)} L ≈ ${Math.ceil(res.litres / 25)} × 25L bulk from Danlect (plus any 25L sold whole)`}>
          <DataTable searchable={false} rows={res.products} filename="demand-forecast.csv" initialSort={{ key: 'next', dir: 'desc' }} cols={[
            { key: 'name', label: 'Product' },
            { key: 'last', label: 'Last month', align: 'right', render: r => num(r.last) },
            { key: 'avg3', label: '3-mo avg', align: 'right', render: r => num(r.avg3, 1) },
            { key: 'next', label: 'Forecast qty', align: 'right', render: r => <b>{num(r.next)}</b> },
            { key: 'revenue', label: 'Revenue', align: 'right', render: r => num(r.revenue, 2) },
            { key: 'cost', label: 'Stock cost', align: 'right', render: r => r.cost ? num(r.cost, 2) : 'no cost' },
          ]} />
        </Panel>
        <Panel title="Cash-flow projection" sub="Forecast cash collected − purchases − expenses">
          <DataTable searchable={false} rows={res.cash} filename="cash-projection.csv" cols={[
            { key: 'month', label: 'Month', render: r => monthLabel(r.month) },
            { key: 'inflow', label: 'Cash in', align: 'right', render: r => num(r.inflow, 2) },
            { key: 'purchases', label: 'Purchases', align: 'right', render: r => num(r.purchases, 2) },
            { key: 'expenses', label: 'Expenses', align: 'right', render: r => num(r.expenses, 2) },
            { key: 'net', label: 'Net', align: 'right', render: r => <span className={r.net < 0 ? 'text-bad font-semibold' : 'text-ok font-semibold'}>{num(r.net, 2)}</span> },
            { key: 'cum', label: 'Cumulative', align: 'right', render: r => num(r.cum, 2) },
          ]} />
        </Panel>
      </div>
      <Panel title="Forecast table" className="mt-4">
        <DataTable searchable={false} rows={fut} filename={`forecast-${metric}.csv`} cols={[
          { key: 'month', label: 'Month', render: r => monthLabel(r.month) },
          { key: 'lo', label: 'Low', align: 'right', render: r => fmt(r.lo || 0) },
          { key: 'forecast', label: 'Forecast', align: 'right', render: r => <b>{fmt(r.forecast || 0)}</b> },
          { key: 'hi', label: 'High', align: 'right', render: r => fmt(r.hi || 0) },
        ]} />
      </Panel>
    </div>
  )
}
