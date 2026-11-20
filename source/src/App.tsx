import { useEffect, useState, type ReactNode } from 'react'
import { AppProvider, useApp, useRoute, go } from '@/lib/store'
import { getApiUrl, setApiUrl, api } from '@/lib/api'
import { MykaLogo, Sunburst } from '@/components/MykaLogo'
import type { Module } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { Field, TextInput } from '@/components/kit'
import { MfaStep, RecoveryCodesView, SecurityDialog } from '@/components/Security'
import type { LoginResult } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, ReceiptText, ShoppingCart, Users, Package, Truck, BookOpen, TrendingUp,
  LineChart, ShieldCheck, Settings2, LogOut, Menu, X, Moon, Sun, RefreshCw, Loader2, Lock,
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

const TABS = ['/dashboard', '/invoices', '/receipts', '/purchases']

function Shell({ children }: { children: ReactNode }) {
  const { user, data, logout, can, reload } = useApp()
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const [secOpen, setSecOpen] = useState(false)
  const items = NAV.filter(n => can(n.mod))
  const groups = [...new Set(items.map(i => i.group))]
  const current = items.find(i => route.startsWith(i.path))
  const tabs = items.filter(i => TABS.includes(i.path)).slice(0, 4)
  useEffect(() => setOpen(false), [route])
  useEffect(() => { document.title = (current ? current.label + ' · ' : '') + 'Myka Quad' }, [current])
  const refresh = async () => { setRefreshing(true); try { await reload(); toast.success('Data refreshed') } finally { setRefreshing(false) } }
  const iconBtn = 'h-10 w-10 grid place-items-center rounded-full hover:bg-secondary active:bg-secondary/70 transition-colors'

  const NavList = (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map(g => (
        <div key={g} className="mt-4">
          <div className="px-3 pb-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">{g}</div>
          {items.filter(i => i.group === g).map(i => {
            const active = route.startsWith(i.path)
            return (
              <a key={i.path} href={'#' + i.path} aria-current={active ? 'page' : undefined}
                className={cn('flex items-center gap-3 px-3 min-h-[40px] rounded-[10px] text-[14px] font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'text-foreground/85 hover:bg-secondary')}>
                <i.icon className="h-[18px] w-[18px]" aria-hidden /> {i.label}
              </a>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/* sidebar (desktop) / sheet (mobile "More") */}
      <aside aria-label="Navigation" className={cn('no-print fixed inset-y-0 left-0 z-50 w-[280px] lg:w-[264px] material border-r flex flex-col pt-safe transition-transform duration-300 ease-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen',
        open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="px-5 pt-5 pb-2 flex items-center gap-3">
          <MykaLogo className="h-9 w-auto drop-shadow-sm" />
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold font-display text-primary">Myka Quad</div>
            <div className="text-xs text-muted-foreground">Mini ERP</div>
          </div>
          <button className={cn(iconBtn, 'ml-auto lg:hidden')} onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        {NavList}
        <div className="border-t p-3 pb-safe">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="h-9 w-9 rounded-full bg-primary/15 text-primary grid place-items-center text-sm font-semibold" aria-hidden>{(user?.name || '?').slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{user?.name}</div>
              <div className="text-xs text-muted-foreground truncate">@{user?.username} · {user?.role}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2">
            <button onClick={() => setDark(!dark)} className={iconBtn} aria-label={dark ? 'Light appearance' : 'Dark appearance'} title="Appearance">{dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}</button>
            <button onClick={refresh} className={iconBtn} aria-label="Refresh data" title="Refresh data"><RefreshCw className={cn('h-[18px] w-[18px]', refreshing && 'animate-spin')} /></button>
            <button onClick={() => setSecOpen(true)} className={iconBtn} aria-label="Account security" title="Account security"><Lock className="h-[18px] w-[18px]" /></button>
            <button onClick={logout} className="ml-auto flex items-center gap-1.5 px-3 h-10 rounded-full text-sm font-medium text-bad hover:bg-bad/10"><LogOut className="h-4 w-4" aria-hidden /> Sign out</button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden no-print" onClick={() => setOpen(false)} aria-hidden />}

      <div className="min-w-0 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        {/* mobile navigation bar */}
        <header className="no-print lg:hidden sticky top-0 z-30 material border-b pt-safe">
          <div className="flex items-center gap-2 px-3 h-12">
            <MykaLogo className="h-7 w-auto ml-1" title="" />
            <span className="font-semibold text-[15px] truncate">{current?.label || data?.settings.companyName}</span>
            <button onClick={refresh} className={cn(iconBtn, 'ml-auto')} aria-label="Refresh data"><RefreshCw className={cn('h-[18px] w-[18px]', refreshing && 'animate-spin')} /></button>
          </div>
        </header>
        <main className="px-4 sm:px-6 lg:px-10 py-5 lg:py-8 max-w-[1400px] mx-auto">{children}</main>
      </div>

      {/* mobile tab bar (HIG: max 5 items) */}
      <nav aria-label="Tabs" className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 material border-t pb-safe">
        <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map(i => {
            const active = route.startsWith(i.path)
            return (
              <a key={i.path} href={'#' + i.path} aria-current={active ? 'page' : undefined}
                className={cn('flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
                <i.icon className="h-[22px] w-[22px]" aria-hidden />{i.label.split(' ')[0]}
              </a>
            )
          })}
          <button onClick={() => setOpen(true)} aria-label="More sections" className={cn('flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium', open || (current && !TABS.includes(current.path)) ? 'text-primary' : 'text-muted-foreground')}>
            <Menu className="h-[22px] w-[22px]" aria-hidden />More
          </button>
        </div>
      </nav>
      <SecurityDialog open={secOpen} onClose={() => setSecOpen(false)} />
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
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden text-[#111]">
        <Sunburst className="absolute inset-0 h-full w-full" />
        <MykaLogo className="relative h-20 w-auto self-start drop-shadow-md" />
        <div className="relative">
          <div className="text-xs tracking-[0.2em] text-[#075C25] font-extrabold mb-3 font-display">MYKA QUAD LIMITED</div>
          <h1 className="font-display text-[40px] font-extrabold leading-[1.1] max-w-md text-[#075C25]">Invoices, receipts, books and forecasts. One place.</h1>
          <p className="mt-4 text-[#3a2a00] max-w-md text-[15px] leading-relaxed font-semibold">Palm oil, gari and eggs, from Danlect and Theodora Farms to your customers. Every sale posts straight to the general journal.</p>
        </div>
        <div className="relative text-xs text-[#3a2a00] font-semibold">#377A Lakeside Estate, Accra · 027 405 1234</div>
        <div className="absolute inset-x-0 bottom-0 h-3 bg-[#8CC63F]" aria-hidden />
      </div>
      <div className="flex flex-col items-center justify-center p-5 pt-safe gap-6">
        <MykaLogo className="h-14 w-auto lg:hidden" />
        <div className="w-full max-w-sm bg-card rounded-[20px] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0_0_0/0.06)] border">{children}</div>
      </div>
    </div>
  )
}

function Login() {
  const { login, error } = useApp()
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(error)
  const [pending, setPending] = useState<Extract<LoginResult, { mfa: 'verify' | 'enroll' }> | null>(null)
  if (pending) return <AuthFrame><MfaStep pending={pending} onCancel={() => { setPending(null); setP('') }} /></AuthFrame>
  return (
    <AuthFrame>
      <form className="w-full" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr('')
        try { const r = await login(u, p); if (r.mfa) setPending(r) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
      }}>
        <h2 className="text-[26px] font-bold">Sign in</h2>
        <p className="text-sm text-muted-foreground mb-6">Use the account your administrator created for you.</p>
        <div className="space-y-4">
          <Field label="Username"><TextInput autoFocus autoComplete="username" value={u} onChange={e => setU(e.target.value)} /></Field>
          <Field label="Password"><TextInput type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></Field>
          {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded px-3 py-2">{err}</div>}
          <Button className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Sign in</Button>
        </div>
      </form>
    </AuthFrame>
  )
}

function Setup() {
  const [url, setUrl] = useState(getApiUrl()); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <AuthFrame>
      <form className="w-full" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setMsg('')
        setApiUrl(url)
        try { await api('ping'); location.reload() } catch (x) { setMsg((x as Error).message); setApiUrl('') } finally { setBusy(false) }
      }}>
        <h2 className="text-[26px] font-bold">Connect the database</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Enter the API address for this app. On the normal Myka Quad site this is just <span className="mono">/api</span>.</p>
        <Field label="API address"><TextInput value={url} onChange={e => setUrl(e.target.value)} placeholder="/api" /></Field>
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
      <form className="w-full" onSubmit={async e => {
        e.preventDefault(); setErr('')
        if (n1 !== n2) { setErr("The new passwords don't match."); return }
        setBusy(true)
        try { const r = await api('changePassword', { current: cur, next: n1 }); setUser(r.user); await reload(); toast.success('Password updated') }
        catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
      }}>
        <h2 className="text-[26px] font-bold">Set your password</h2>
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
  const { data, loading, user, error, recoveryCodes, clearRecovery } = useApp()
  if (!getApiUrl()) return <Setup />
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground"><div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading Myka Quad…</div></div>
  if (!data || !user) {
    if (error && !error.toLowerCase().includes('sign')) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><p className="text-bad mb-4">{error}</p><Button onClick={() => location.reload()}>Try again</Button></div></div>
    return <Login />
  }
  if (recoveryCodes) return <AuthFrame><RecoveryCodesView codes={recoveryCodes} onDone={clearRecovery} /></AuthFrame>
  if (user.mustChange === 'Y') return <ChangePassword />
  return <Shell><Router /></Shell>
}

export default function App() {
  return (
    <AppProvider>
      <Gate />
      <Toaster richColors position="top-center" />
    </AppProvider>
  )
}
