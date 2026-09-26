import { useMemo, useState, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { downloadCSV } from '@/lib/fmt'
import { Download, Search, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4 mb-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  )
}

export function Panel({ title, sub, children, className, actions }: { title?: string; sub?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('bg-card border rounded-md', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-2 px-4 pt-4">
          <div>
            {title && <h2 className="font-bold text-[15px]">{title}</h2>}
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'brand' }) {
  const bar = tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : tone === 'ok' ? 'bg-ok' : 'bg-brand'
  return (
    <div className="bg-card border rounded-md p-4 relative overflow-hidden">
      <span className={cn('absolute left-0 top-0 h-full w-1', bar)} />
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold mt-1 tabular">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

const tones: Record<string, string> = {
  PAID: 'bg-ok/10 text-ok border-ok/30', ACTIVE: 'bg-ok/10 text-ok border-ok/30', Clean: 'bg-ok/10 text-ok border-ok/30',
  PARTIAL: 'bg-warn/10 text-[hsl(30_80%_32%)] border-warn/40', 'Needs attention': 'bg-warn/10 text-[hsl(30_80%_32%)] border-warn/40',
  UNPAID: 'bg-bad/10 text-bad border-bad/30', Critical: 'bg-bad/10 text-bad border-bad/30',
  VOID: 'bg-muted text-muted-foreground border-border line-through', DEMO: 'bg-accent text-accent-foreground border-flame/30',
}
export function Tag({ children, tone, className }: { children: ReactNode; tone?: string; className?: string }) {
  const k = tone || String(children)
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', tones[k] || 'bg-secondary text-secondary-foreground border-border', className)}>{children}</span>
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-xs font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  )
}

export function NativeSelect({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn('h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60', className)}>
      {children}
    </select>
  )
}
export function TextInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn('h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60', className)} />
}

export interface Col<T> { key: string; label: string; render?: (r: T) => ReactNode; align?: 'right' | 'left'; sortValue?: (r: T) => string | number; csv?: (r: T) => unknown; className?: string }

export function DataTable<T extends Record<string, any>>({ rows, cols, filename, onRow, empty, searchable = true, initialSort, pageSize = 50, toolbar }: {
  rows: T[]; cols: Col<T>[]; filename?: string; onRow?: (r: T) => void; empty?: ReactNode; searchable?: boolean
  initialSort?: { key: string; dir: 'asc' | 'desc' }; pageSize?: number; toolbar?: ReactNode
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort || null)
  const [limit, setLimit] = useState(pageSize)
  const filtered = useMemo(() => {
    let out = rows
    if (q.trim()) {
      const s = q.toLowerCase()
      out = out.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(s)))
    }
    if (sort) {
      const col = cols.find(c => c.key === sort.key)
      const val = (r: T) => (col?.sortValue ? col.sortValue(r) : r[sort.key])
      out = [...out].sort((a, b) => {
        const x = val(a), y = val(b)
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))
        return sort.dir === 'asc' ? c : -c
      })
    }
    return out
  }, [rows, q, sort, cols])
  return (
    <div>
      {(searchable || filename || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
          {searchable && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <TextInput placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} className="pl-8" />
            </div>
          )}
          {toolbar}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} row{filtered.length === 1 ? '' : 's'}</span>
          {filename && (
            <Button variant="outline" size="sm" onClick={() => downloadCSV(filename, filtered.map(r => Object.fromEntries(cols.map(c => [c.key, c.csv ? c.csv(r) : r[c.key]]))), cols.map(c => ({ key: c.key, label: c.label })))}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          )}
        </div>
      )}
      <div className="overflow-x-auto border rounded-md bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/70 text-left">
              {cols.map(c => (
                <th key={c.key} className={cn('px-3 py-2 font-semibold text-xs whitespace-nowrap select-none cursor-pointer', c.align === 'right' && 'text-right')}
                  onClick={() => setSort(s => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                  {c.label}{sort?.key === c.key && <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-60" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r, i) => (
              <tr key={i} onClick={onRow ? () => onRow(r) : undefined} className={cn('border-t', onRow && 'cursor-pointer hover:bg-accent/40')}>
                {cols.map(c => (
                  <td key={c.key} className={cn('px-3 py-2 align-top', c.className ? '' : 'whitespace-nowrap', c.align === 'right' && 'text-right tabular whitespace-nowrap', c.className)}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-muted-foreground">{empty || 'Nothing here yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="text-center mt-3"><Button variant="ghost" size="sm" onClick={() => setLimit(l => l + pageSize)}>Show more ({filtered.length - limit} left)</Button></div>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed rounded-md p-8 text-center bg-card/50">
      <div className="font-semibold">{title}</div>
      {children && <div className="text-sm text-muted-foreground mt-1">{children}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors', value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
