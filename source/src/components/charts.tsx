import { ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { compact, money } from '@/lib/fmt'

export const C = {
  green: 'hsl(var(--chart-1))', flame: 'hsl(var(--chart-2))', blue: 'hsl(var(--chart-3))',
  rose: 'hsl(var(--chart-4))', olive: 'hsl(var(--chart-5))', grid: 'hsl(var(--border))', axis: 'hsl(var(--muted-foreground))',
}
export const SERIES = [C.green, C.flame, C.blue, C.rose, C.olive]

export const axisProps = { stroke: C.axis, fontSize: 11, tickLine: false, axisLine: false } as const
export const grid = <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />

export function MoneyTooltip({ active, payload, label, fmtLabel }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-semibold mb-1">{fmtLabel ? fmtLabel(label) : label}</div>
      {payload.filter((p: any) => p.value !== undefined && p.value !== null).map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold tabular">{Array.isArray(p.value) ? p.value.map((v: number) => compact(v)).join(' – ') : p.unit === 'qty' ? p.value : money(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export { ResponsiveContainer, XAxis, YAxis, Tooltip, Legend }
export const yMoney = { ...axisProps, tickFormatter: (v: number) => compact(v), width: 48 }
