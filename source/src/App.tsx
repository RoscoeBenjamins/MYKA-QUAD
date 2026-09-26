import { useEffect, useState, type ReactNode } from 'react'
import { AppProvider, useApp, useRoute, go } from '@/lib/store'
import { getApiUrl, setApiUrl, api } from '@/lib/api'
import { LOGO } from '@/lib/logo'
import type { Module } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { Field, TextInput } from '@/components/kit'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, ReceiptText, ShoppingCart, Users, Package, Truck, BookOpen, TrendingUp,
  LineChart, ShieldCheck, Settings2, LogOut, Menu, X, Moon, Sun, RefreshCw, Loader2,
} from 'lucide-react'
import Dashboard from '@/pages/Dashboard'
import Invoices from '@/pages/Invoices'
import Receipts from '@/pages/Receipts'
import Purchases from '@/pages/Purchases'
import { Customers, Products, Suppliers } from '@/pages/MasterData'
import Accounting from '@/pages/Accounting'
import Trends from '@/pages/Trends'
import Forecast from '@/pages/Forecast'
import Hygiene from '@/pages/Hygiene'
import Admin from '@/pages/Admin'

const NAV: { path: string; label: string; icon: any; mod: Module; group: string }[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, mod: 'dashboard', group: 'Overview' },
  { path: '/invoices', label: 'Invoices', icon: FileText, mod: 'sales', group: 'Operations' },
  { path: '/receipts', label: 'Receipts', icon: ReceiptText, mod: 'sales', group: 'Operations' },
  { path: '/purchases', label: 'Purchases & Expenses', icon: ShoppingCart, mod: 'purchases', group: 'Operations' },
  { path: '/customers', label: 'Customers', icon: Users, mod: 'customers', group: 'Records' },
  { path: '/products', label: 'Products & Pricing', icon: Package, mod: 'products', group: 'Records' },
  { path: '/suppliers', label: 'Suppliers', icon: Truck, mod: 'suppliers', group: 'Records' },
  { path: '/accounting', label: 'Accounting', icon: BookOpen, mod: 'accounting', group: 'Finance' },
  { path: '/trends', label: 'Trend Analysis', icon: TrendingUp, mod: 'trends', group: 'Insights' },
  { path: '/forecast', label: 'Forecast', icon: LineChart, mod: 'forecast', group: 'Insights' },
  { path: '/hygiene', label: 'Data Hygiene KPIs', icon: ShieldCheck, mod: 'hygiene', group: 'Insights' },
  { path: '/admin', label: 'Admin Portal', icon: Settings2, mod: 'admin', group: 'Admin' },
]

function useTheme() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('myka.theme') === 'dark' } catch { return false } })
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try { localStorage.setItem('myka.theme', dark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [dark])
  return [dark, setDark] as const
}

function Shell({ children }: { children: ReactNode }) {
  const { user, data, logout, can, reload } = useApp()
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const items = NAV.filter(n => can(n.mod))
  const groups = [...new Set(items.map(i => i.group))]
  useEffect(() => setOpen(false), [route])
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className={cn('no-print fixed inset-y-0 left-0 z-40 w-[248px] bg-brand-dark text-[hsl(60_20%_92%)] flex flex-col transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen',
        open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="px-4 pt-5 pb-4 flex items-center gap-3">
          <div className="bg-white rounded px-2 py-1.5"><img src={LOGO} alt="Myka" className="h-7" /></div>
          <div className="leading-tight">
            <div className="text-[11px] tracking-[0.18em] text-[hsl(30_92%_60%)] font-bold">MYKA QUAD</div>
            <div className="text-xs opacity-70">Mini ERP</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map(g => (
            <div key={g} className="mt-3">
              <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] opacity-50 font-semibold">{g}</div>
              {items.filter(i => i.group === g).map(i => {
                const active = route.startsWith(i.path)
                return (
                  <a key={i.path} href={'#' + i.path}
                    className={cn('flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium',
                      active ? 'bg-white/10 text-white shadow-[inset_3px_0_0_hsl(30_92%_52%)]' : 'opacity-80 hover:opacity-100 hover:bg-white/5')}>
                    <i.icon className="h-4 w-4" /> {i.label}
                  </a>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-xs">
          <div className="font-semibold text-sm truncate">{user?.name}</div>
          <div className="opacity-60 truncate">@{user?.username} · {user?.role}</div>
          <div className="flex gap-1 mt-2">
            <button onClick={() => setDark(!dark)} className="p-1.5 rounded hover:bg-white/10" title="Toggle theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <button onClick={async () => { setRefreshing(true); await reload(); setRefreshing(false); toast.success('Data refreshed') }} className="p-1.5 rounded hover:bg-white/10" title="Refresh data">
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
            <button onClick={logout} className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded hover:bg-white/10"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden no-print" onClick={() => setOpen(false)} />}
      <div className="min-w-0">
        <header className="no-print lg:hidden sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-4 h-14">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <img src={LOGO} alt="" className="h-6" />
          <span className="font-bold text-sm">{data?.settings.companyName}</span>
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px]">{children}</main>
      </div>
    </div>
  )
}

function Router() {
  const route = useRoute()
  const { can } = useApp()
  const [base, a, b] = route.split('?')[0].split('/').filter(Boolean)
  const nav = NAV.find(n => n.path === '/' + base)
  if (!nav || !can(nav.mod)) {
    const first = NAV.find(n => can(n.mod))
    if (first && nav?.path !== first.path) { setTimeout(() => go(first.path)); return null }
    return <div className="text-muted-foreground">You don't have access to any area yet. Ask the administrator to grant access.</div>
  }
  switch (base) {
    case 'dashboard': return <Dashboard />
    case 'invoices': return <Invoices sub={a} />
    case 'receipts': return <Receipts sub={a} />
    case 'purchases': return <Purchases />
    case 'customers': return <Customers />
    case 'products': return <Products />
    case 'suppliers': return <Suppliers />
    case 'accounting': return <Accounting tab={a} />
    case 'trends': return <Trends />
    case 'forecast': return <Forecast />
    case 'hygiene': return <Hygiene />
    case 'admin': return <Admin tab={a || b} />
  }
  return null
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-brand-dark text-[hsl(60_20%_92%)] p-12 relative overflow-hidden">
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-[hsl(30_92%_48%)]/20 blur-3xl" />
        <div className="bg-white rounded px-3 py-2 w-fit"><img src={LOGO} alt="Myka" className="h-10" /></div>
        <div>
          <div className="text-[11px] tracking-[0.25em] text-[hsl(30_92%_60%)] font-bold mb-3">MYKA QUAD LIMITED</div>
          <h1 className="text-4xl font-extrabold leading-tight max-w-md">Invoices, receipts, books and forecasts — one place.</h1>
          <p className="mt-4 opacity-70 max-w-md text-sm">Palm oil, gari and eggs, from Danlect and Theodora Farms to your customers. Every sale posts straight to the general journal.</p>
        </div>
        <div className="text-xs opacity-50">NO 377A, Tulip Road, Lakeside Estate · 0274051234</div>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  )
}

function Login() {
  const { login, error } = useApp()
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(error)
  return (
    <AuthFrame>
      <form className="w-full max-w-sm" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr('')
        try { await login(u, p) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
      }}>
        <img src={LOGO} alt="Myka" className="h-10 mb-6 lg:hidden" />
        <h2 className="text-2xl font-extrabold">Sign in</h2>
        <p className="text-sm text-muted-foreground mb-6">Use the account your administrator created for you.</p>
        <div className="space-y-4">
          <Field label="Username"><TextInput autoFocus autoComplete="username" value={u} onChange={e => setU(e.target.value)} /></Field>
          <Field label="Password"><TextInput type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></Field>
          {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded px-3 py-2">{err}</div>}
          <Button className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Sign in</Button>
        </div>
        <button type="button" className="mt-8 text-xs text-muted-foreground underline" onClick={() => { setApiUrl(''); location.reload() }}>Change database connection</button>
      </form>
    </AuthFrame>
  )
}

function Setup() {
  const [url, setUrl] = useState(getApiUrl()); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <AuthFrame>
      <form className="w-full max-w-md" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setMsg('')
        setApiUrl(url)
        try { await api('ping'); location.reload() } catch (x) { setMsg((x as Error).message); setApiUrl('') } finally { setBusy(false) }
      }}>
        <h2 className="text-2xl font-extrabold">Connect the database</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Paste the Web app URL from the Apps Script deployment in the <b>Myka Quad ERP</b> Google Drive folder (it ends in <span className="mono">/exec</span>).</p>
        <Field label="Apps Script Web app URL"><TextInput value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></Field>
        {msg && <div className="text-sm text-bad mt-3">{msg}</div>}
        <Button className="w-full mt-4" disabled={busy || !url}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Connect</Button>
      </form>
    </AuthFrame>
  )
}

function ChangePassword() {
  const { setUser, reload, logout, user } = useApp()
  const [cur, setCur] = useState(''); const [n1, setN1] = useState(''); const [n2, setN2] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <AuthFrame>
      <form className="w-full max-w-sm" onSubmit={async e => {
        e.preventDefault(); setErr('')
        if (n1 !== n2) { setErr("The new passwords don't match."); return }
        setBusy(true)
        try { const r = await api('changePassword', { current: cur, next: n1 }); setUser(r.user); await reload(); toast.success('Password updated') }
        catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
      }}>
        <h2 className="text-2xl font-extrabold">Set your password</h2>
        <p className="text-sm text-muted-foreground mb-6">Hi {user?.name}. You're using a temporary password — choose your own (8+ characters with a number).</p>
        <div className="space-y-4">
          <Field label="Temporary password"><TextInput type="password" value={cur} onChange={e => setCur(e.target.value)} /></Field>
          <Field label="New password"><TextInput type="password" autoComplete="new-password" value={n1} onChange={e => setN1(e.target.value)} /></Field>
          <Field label="Repeat new password"><TextInput type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} /></Field>
          {err && <div className="text-sm text-bad">{err}</div>}
          <Button className="w-full" disabled={busy}>Save password</Button>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={logout}>Sign out</button>
        </div>
      </form>
    </AuthFrame>
  )
}

function Gate() {
  const { data, loading, user, error } = useApp()
  if (!getApiUrl()) return <Setup />
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground"><div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading Myka Quad…</div></div>
  if (!data || !user) {
    if (error && !error.toLowerCase().includes('sign')) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><p className="text-bad mb-4">{error}</p><Button onClick={() => location.reload()}>Try again</Button></div></div>
    return <Login />
  }
  if (user.mustChange === 'Y') return <ChangePassword />
  return <Shell><Router /></Shell>
}

export default function App() {
  return (
    <AppProvider>
      <Gate />
      <Toaster richColors position="top-right" />
    </AppProvider>
  )
}
