import { useMemo, useState } from 'react'
import { useApp, go } from '@/lib/store'
import { api } from '@/lib/api'
import { invoiceStates, hygieneAudit, masterDataAudit, type HygieneRow } from '@/lib/analytics'
import { fmtDate, money, num, pct } from '@/lib/fmt'
import { PageHeader, Panel, Stat, DataTable, Tag, Segmented } from '@/components/kit'
import { C, axisProps } from '@/components/charts'
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList } from 'recharts'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ShieldCheck, AlertTriangle, Loader2, Wand2 } from 'lucide-react'

export default function Hygiene() {
  const { data, reload, canWrite, can } = useApp()
  const d = data!
  const [view, setView] = useState<'flagged' | 'all'>('flagged')
  const [busy, setBusy] = useState<string | null>(null)
  const states = useMemo(() => invoiceStates(d.invoices, d.receipts), [d])
  const h = useMemo(() => hygieneAudit(states, d.customers), [states, d.customers])
  const md = useMemo(() => masterDataAudit(d.products, d.suppliers, d.customers), [d])
  const total = h.open
  const score = total ? h.counts.Clean / total : 1
  const slices = ([['Clean', C.green], ['Needs attention', C.flame], ['Critical', C.rose]] as const)
    .map(([k, color]) => ({ name: k, value: h.counts[k], color })).filter(s => s.value > 0)
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const crit = h.rows.filter(r => r.state === 'Critical')
  const top = crit.slice(0, 2)
  const noNext = h.rows.filter(r => r.flags.some(f => f.key === 'noNextStep'))
  const rows = view === 'flagged' ? h.rows.filter(r => r.state !== 'Clean') : h.rows

  const applyNext = async (list: HygieneRow[]) => {
    setBusy(list.length === 1 ? list[0].inv.invoiceNo : 'bulk')
    try {
      for (const r of list) await api('updateInvoiceNextStep', { invoiceNo: r.inv.invoiceNo, nextStep: r.suggestedNextStep })
      await reload(); toast.success(`Next step set on ${list.length} invoice${list.length === 1 ? '' : 's'}`)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div>
      <PageHeader title="Data Hygiene KPIs"
        sub="Salesforce-style hygiene check applied to Myka Quad's open invoices: missing amounts, past-due dates, missing next steps, stale activity, single-threaded contacts, VAT mismatches and stuck records. Read-only audit — fixes are suggestions you apply."
        actions={<Tag tone={h.counts.Critical ? 'Critical' : 'Clean'} className="text-xs px-2 py-1">{total} OPEN INVOICES</Tag>} />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Stat label="Hygiene score" value={pct(score, 0)} sub="Open invoices with no flags" tone={score >= 0.8 ? 'ok' : score >= 0.5 ? 'warn' : 'bad'} />
        <Stat label="Critical" value={num(h.counts.Critical)} sub={`${share(h.counts.Critical)}% of open`} tone="bad" />
        <Stat label="Needs attention" value={num(h.counts['Needs attention'])} sub={`${share(h.counts['Needs attention'])}% of open`} tone="warn" />
        <Stat label="A/R at risk" value={money(h.atRisk)} sub={`of ${money(h.totalOpen)} outstanding`} tone={h.atRisk ? 'bad' : 'ok'} />
        <Stat label="Typical collection cycle" value={h.median === 0 ? 'Same day' : `${h.median} days`} sub="Median, invoice → final payment" />
      </div>

      <Panel className="mt-4">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-6 w-6 text-brand" /><h2 className="text-xl font-extrabold">Receivables hygiene — {d.settings.companyName}</h2></div>
        <p className="text-xs text-muted-foreground">{total} open invoices · {h.counts.Critical} critical, {h.counts['Needs attention']} need attention, {h.counts.Clean} clean</p>
        <div className="border-t my-4" />
        <div className="grid md:grid-cols-[220px_1fr] gap-6 items-center">
          <div className="h-52 relative">
            {total ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
                    {slices.map(s => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full grid place-items-center text-sm text-muted-foreground">No open invoices</div>}
            {total > 0 && <div className="absolute inset-0 grid place-items-center pointer-events-none"><div className="text-center"><div className="text-3xl font-extrabold">{total}</div><div className="text-[11px] text-muted-foreground">Open invoices</div></div></div>}
          </div>
          <div>
            <h3 className="font-bold">{!total ? 'Nothing open — books are clean' : score >= 0.8 ? 'The ledger is in good shape' : score >= 0.5 ? 'Some invoices need work' : 'Most open invoices need work'}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {total ? <>Clean: {h.counts.Clean} of {total} ({share(h.counts.Clean)}%). Needs attention: {h.counts['Needs attention']} ({share(h.counts['Needs attention'])}%). Critical: {h.counts.Critical} ({share(h.counts.Critical)}%).</> : 'Every invoice is paid or void.'}
            </p>
          </div>
        </div>
        {h.issues.length > 0 && (
          <>
            <h3 className="font-bold mt-6">Issue frequency</h3>
            <p className="text-sm text-muted-foreground">
              {h.issues[0].label} is the most common flag ({h.issues[0].count} invoice{h.issues[0].count === 1 ? '' : 's'}){h.issues[1] ? `, followed by ${h.issues[1].label.toLowerCase()} (${h.issues[1].count})` : ''}.
              {noNext.length ? ` Setting a dated next step clears ${noNext.length} flag${noNext.length === 1 ? '' : 's'} in one go.` : ''}
            </p>
            <div className="h-60 mt-2">
              <ResponsiveContainer>
                <BarChart data={h.issues} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" {...axisProps} interval={0} fontSize={11} />
                  <YAxis {...axisProps} allowDecimals={false} width={30} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="count" name="Invoices" fill={C.green} radius={[3, 3, 0, 0]} maxBarSize={56}>
                    <LabelList dataKey="count" position="top" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Most common issues across the {total} open invoices</p>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mt-6 mb-3">
          <h3 className="font-bold">Flagged invoices with the specific fix, most severe first</h3>
          <Segmented value={view} onChange={setView} options={[{ value: 'flagged', label: 'Flagged' }, { value: 'all', label: 'All open' }]} />
        </div>
        <DataTable rows={rows} searchable={false} filename="hygiene-check.csv" pageSize={25}
          cols={[
            { key: 'state', label: 'Status', render: r => <Tag>{r.state}</Tag>, csv: r => r.state },
            { key: 'inv', label: 'Invoice', sortValue: r => r.inv.invoiceNo, render: r => <a className="underline mono text-xs" href={'#/invoices/' + encodeURIComponent(r.inv.invoiceNo)}>{r.inv.invoiceNo}</a>, csv: r => r.inv.invoiceNo },
            { key: 'customer', label: 'Customer', sortValue: r => r.inv.customerName, render: r => r.inv.customerName, csv: r => r.inv.customerName },
            { key: 'amount', label: 'Outstanding', align: 'right', sortValue: r => r.inv.outstanding, render: r => num(r.inv.outstanding, 2), csv: r => r.inv.outstanding },
            { key: 'due', label: 'Due', sortValue: r => r.inv.dueDate, render: r => fmtDate(r.inv.dueDate), csv: r => r.inv.dueDate },
            { key: 'issue', label: 'Issues', className: 'min-w-[180px]', render: r => <div className="flex flex-wrap gap-1">{r.flags.map(f => <Tag key={f.key} tone={f.severity}>{f.label}</Tag>)}</div>, csv: r => r.flags.map(f => f.label).join('; ') },
            { key: 'fix', label: 'Suggested fix', className: 'min-w-[280px] max-w-[380px] text-xs', render: r => <ul className="list-disc pl-4 space-y-0.5">{r.flags.map(f => <li key={f.key}>{f.fix}</li>)}</ul>, csv: r => r.flags.map(f => f.fix).join(' | ') },
            { key: 'act', label: '', render: r => canWrite && can('sales') && r.flags.some(f => f.key === 'noNextStep') ? (
              <Button size="sm" variant="outline" disabled={!!busy} title={r.suggestedNextStep} onClick={() => applyNext([r])}>{busy === r.inv.invoiceNo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Set next step'}</Button>
            ) : null },
          ]} empty="No flagged invoices." />

        {total > 0 && (crit.length > 0 || noNext.length > 0) && (
          <div className="mt-5 border border-warn/50 bg-warn/10 rounded-md p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warn mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-bold">{crit.length ? `${crit.length === 1 ? 'One fix' : top.length === 2 && crit.length === 2 ? 'Two fixes' : `${crit.length} fixes`} can't wait` : 'Add next steps to stay on top of collections'}</div>
                <p className="text-sm mt-1">
                  {top.length ? top.map(r => `${r.inv.customerName} owes ${money(r.inv.outstanding)} on ${r.inv.invoiceNo}${r.inv.daysOverdue ? ` (${r.inv.daysOverdue} days late)` : ''}`).join('; ') + '. ' : ''}
                  {noNext.length ? `${noNext.length} open invoice${noNext.length === 1 ? ' has' : 's have'} no next step.` : ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {canWrite && can('sales') && noNext.length > 0 && <Button size="sm" disabled={!!busy} onClick={() => applyNext(noNext)}>{busy === 'bulk' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1.5" />}Apply {noNext.length} suggested next step{noNext.length === 1 ? '' : 's'}</Button>}
                  <Button size="sm" variant="outline" onClick={() => go('/invoices')}>View in invoices</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Master-data hygiene" sub="Products, suppliers and customers with missing or suspicious fields" className="mt-4">
        <DataTable rows={md} searchable={false} filename="master-data-hygiene.csv" cols={[
          { key: 'severity', label: 'Status', render: r => <Tag>{r.severity}</Tag> },
          { key: 'area', label: 'Area' }, { key: 'record', label: 'Record' }, { key: 'issue', label: 'Issue' },
          { key: 'fix', label: 'Suggested fix', className: 'text-xs' },
          { key: 'go', label: '', render: r => <Button size="sm" variant="ghost" onClick={() => go('/' + r.area.toLowerCase())}>Open</Button> },
        ]} empty="All master data looks complete." />
      </Panel>
    </div>
  )
}
