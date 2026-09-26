export const money = (n: number | undefined | null, cur = 'GHS') =>
  `${cur} ${(Number(n) || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const num = (n: number | undefined | null, d = 0) =>
  (Number(n) || 0).toLocaleString('en-GH', { minimumFractionDigits: d, maximumFractionDigits: d })

export const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return n.toFixed(0)
}

export const pct = (n: number, d = 1) => `${((Number(n) || 0) * 100).toFixed(d)}%`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDate = (iso: string) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!d) return iso
  return `${d}-${MONTHS[+m - 1]}-${y.slice(2)}`
}
export const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y.slice(2)}` }

export const todayISO = () => {
  const d = new Date(); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000)

export const addMonths = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + k, 1))
  return t.toISOString().slice(0, 7)
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[], columns?: { key: string; label: string }[]) {
  const cols = columns || Object.keys(rows[0] || {}).map(k => ({ key: k, label: k }))
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(r[c.key])).join(','))].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
