import { useEffect, useState } from 'react'
import { useApp, go } from '@/lib/store'
import { api, getApiUrl, setApiUrl } from '@/lib/api'
import { MODULE_LABELS, type Module, type Role, type User, type Settings } from '@/lib/types'
import { fmtDate } from '@/lib/fmt'
import { PageHeader, Panel, DataTable, Tag, Field, NativeSelect, TextInput } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { UserPlus, Loader2, KeyRound, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [['users', 'Users & access'], ['settings', 'Company settings'], ['audit', 'Audit log'], ['demo', 'Demo data'], ['connection', 'Connection']] as const
const ASSIGNABLE: Module[] = ['dashboard', 'sales', 'purchases', 'customers', 'products', 'suppliers', 'accounting', 'trends', 'forecast', 'hygiene']
const PRESETS: Record<Role, Module[]> = {
  admin: ASSIGNABLE, manager: ASSIGNABLE,
  staff: ['dashboard', 'sales', 'customers', 'products'],
  viewer: ['dashboard', 'trends', 'forecast'],
}
const ROLE_HELP: Record<Role, string> = {
  admin: 'Everything, including this portal (users, settings, demo data).',
  manager: 'Can record and void documents in the areas ticked below.',
  staff: 'Can record invoices, receipts etc. in the areas ticked below — cannot void.',
  viewer: 'Read-only: can look at the areas ticked below but not change anything.',
}

export default function Admin({ tab = 'users' }: { tab?: string }) {
  return (
    <div>
      <PageHeader title="Admin Portal" sub="Create users, choose exactly which areas each person can open, and manage company settings" />
      <div className="flex flex-wrap gap-1 mb-5 border-b">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => go('/admin/' + k)} className={cn('px-3 py-2 text-sm font-semibold border-b-2 -mb-px', tab === k ? 'border-flame' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      {tab === 'users' && <Users />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <Audit />}
      {tab === 'demo' && <Demo />}
      {tab === 'connection' && <Connection />}
    </div>
  )
}

function Users() {
  const { user: me } = useApp()
  const [users, setUsers] = useState<User[] | null>(null)
  const [edit, setEdit] = useState<User | null | undefined>(undefined)
  const [reset, setReset] = useState<User | null>(null)
  const load = async () => { try { setUsers((await api('listUsers')).users) } catch (e) { toast.error((e as Error).message) } }
  useEffect(() => { load() }, [])
  return (
    <>
      <div className="flex justify-end mb-3"><Button onClick={() => setEdit(null)}><UserPlus className="h-4 w-4 mr-1.5" />New user</Button></div>
      {!users ? <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading users…</div> : (
        <DataTable rows={users} onRow={u => setEdit(u)} cols={[
          { key: 'username', label: 'Username', render: u => <span className="mono text-xs font-medium">{u.username}</span> },
          { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
          { key: 'role', label: 'Role', render: u => <Tag tone={u.role === 'admin' ? 'PAID' : undefined}>{u.role}</Tag> },
          { key: 'modules', label: 'Access', className: 'max-w-[360px]', render: u => u.role === 'admin' ? <span className="text-xs">Everything</span> : <div className="flex flex-wrap gap-1">{u.modules.map(m => <Tag key={m}>{MODULE_LABELS[m]?.split(' (')[0] || m}</Tag>)}</div> },
          { key: 'active', label: 'Status', render: u => u.active === 'Y' ? (u.mustChange === 'Y' ? <Tag tone="PARTIAL">Must set password</Tag> : <Tag tone="ACTIVE">Active</Tag>) : <Tag tone="VOID">Disabled</Tag> },
          { key: 'lastLogin', label: 'Last sign-in', render: u => u.lastLogin ? fmtDate(u.lastLogin.slice(0, 10)) : '—' },
          { key: 'act', label: '', render: u => <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setReset(u) }}><KeyRound className="h-3.5 w-3.5 mr-1" />Reset password</Button> },
        ]} />
      )}
      <UserDialog open={edit !== undefined} initial={edit} me={me!} onClose={() => setEdit(undefined)} onSaved={load} />
      <ResetDialog user={reset} onClose={() => setReset(null)} onDone={load} />
    </>
  )
}

function genPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(10); crypto.getRandomValues(arr)
  return 'Myka-' + Array.from(arr, x => a[x % a.length]).join('').slice(0, 6) + (arr[0] % 90 + 10)
}

function UserDialog({ open, initial, onClose, onSaved, me }: { open: boolean; initial?: User | null; onClose: () => void; onSaved: () => void; me: User }) {
  const [f, setF] = useState<{ id?: string; username: string; name: string; email: string; role: Role; modules: Module[]; active: string; password: string }>({ username: '', name: '', email: '', role: 'staff', modules: PRESETS.staff, active: 'Y', password: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setF(initial ? { id: initial.id, username: initial.username, name: initial.name, email: initial.email, role: initial.role, modules: initial.modules.filter(m => m !== 'admin'), active: initial.active, password: '' }
      : { username: '', name: '', email: '', role: 'staff', modules: PRESETS.staff, active: 'Y', password: genPassword() })
  }, [open, initial])
  const toggle = (m: Module) => setF(x => ({ ...x, modules: x.modules.includes(m) ? x.modules.filter(y => y !== m) : [...x.modules, m] }))
  const self = initial?.id === me.id
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? `Edit ${initial.username}` : 'Create user'}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Username *" hint="Used to sign in"><TextInput value={f.username} onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} /></Field>
          <Field label="Full name"><TextInput value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><TextInput type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role" hint={ROLE_HELP[f.role]}>
            <NativeSelect value={f.role} disabled={self} onChange={e => { const r = e.target.value as Role; setF({ ...f, role: r, modules: PRESETS[r] }) }}>
              <option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer (read-only)</option>
            </NativeSelect>
          </Field>
          {!initial && <Field label="Temporary password" hint="They'll be asked to change it at first sign-in. Share it privately." className="sm:col-span-2"><TextInput className="mono" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>}
        </div>
        {f.role !== 'admin' && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Give access to</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {ASSIGNABLE.map(m => (
                <label key={m} className="flex items-center gap-2 text-sm border rounded px-3 py-2 cursor-pointer hover:bg-accent/40">
                  <Checkbox checked={f.modules.includes(m)} onCheckedChange={() => toggle(m)} /> {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><Checkbox disabled={self} checked={f.active === 'Y'} onCheckedChange={v => setF({ ...f, active: v ? 'Y' : 'N' })} /> Account active (untick to block sign-in immediately)</label>
        <DialogFooter>
          {initial && !self && <Button variant="ghost" className="text-bad mr-auto" onClick={async () => {
            if (!confirm(`Delete ${initial.username}? This cannot be undone.`)) return
            try { await api('deleteUser', { id: initial.id }); toast.success('User deleted'); onSaved(); onClose() } catch (e) { toast.error((e as Error).message) }
          }}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.username} onClick={async () => {
            setBusy(true)
            try {
              await api('saveUser', f)
              if (!initial) {
                try { await navigator.clipboard.writeText(`Myka Quad ERP\n${location.href.split('#')[0]}\nUsername: ${f.username}\nTemporary password: ${f.password}`) } catch { /* no clipboard */ }
                toast.success(`User ${f.username} created — sign-in details copied to clipboard`)
              } else toast.success('User updated')
              onSaved(); onClose()
            } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{initial ? 'Save changes' : 'Create user'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetDialog({ user, onClose, onDone }: { user: User | null; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (user) setPw(genPassword()) }, [user])
  return (
    <Dialog open={!!user} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reset password for {user?.username}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">They'll be signed out everywhere and asked to choose a new password next time.</p>
        <Field label="New temporary password"><TextInput className="mono" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true)
            try { await api('resetPassword', { id: user!.id, password: pw }); try { await navigator.clipboard.writeText(pw) } catch { /* ignore */ } toast.success('Password reset — copied to clipboard'); onDone(); onClose() }
            catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>Reset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const SETTING_FIELDS: [keyof Settings, string, string?][] = [
  ['companyName', 'Company name'], ['address', 'Business address'], ['email', 'Email'], ['phone', 'Contact number'],
  ['momo', 'MoMo number'], ['bankName', 'Bank name'], ['bankAccount', 'Bank account number'], ['currency', 'Currency'],
  ['vatRate', 'VAT rate (flat, decimal)', 'e.g. 0.03 = 3%. Confirm against the GRA registration.'], ['defaultVatStatus', 'Default VAT status for new customers'],
  ['paymentTermsDays', 'Payment terms (days)', 'Sets the default due date on new invoices'],
  ['invPrefix', 'Invoice prefix'], ['invYear', 'Invoice year'], ['invNext', 'Next invoice number', 'Only move forward — never reuse numbers'],
  ['rctPrefix', 'Receipt prefix'], ['rctYear', 'Receipt year'], ['rctNext', 'Next receipt number'],
  ['purPrefix', 'Purchase prefix'], ['purNext', 'Next purchase number'], ['expPrefix', 'Expense prefix'], ['expNext', 'Next expense number'],
]

function SettingsTab() {
  const { data, reload } = useApp()
  const [f, setF] = useState<Settings>({ ...data!.settings })
  const [busy, setBusy] = useState(false)
  return (
    <Panel>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {SETTING_FIELDS.map(([k, l, h]) => (
          <Field key={k as string} label={l} hint={h}>
            {k === 'defaultVatStatus' ? <NativeSelect value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}><option>Non-VAT</option><option>VAT</option></NativeSelect>
              : <TextInput value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} />}
          </Field>
        ))}
      </div>
      <div className="mt-4 text-sm text-muted-foreground">Preview: <span className="mono">{f.invPrefix}-{f.invYear}-{f.invNext}</span> · <span className="mono">{f.rctPrefix}-{f.rctYear}-{f.rctNext}</span></div>
      <Button className="mt-4" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await api('saveSettings', f); await reload(); toast.success('Settings saved') } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
      }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save settings</Button>
    </Panel>
  )
}

function Audit() {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => { api('auditLog').then(r => setRows(r.audit)).catch(e => toast.error(e.message)) }, [])
  if (!rows) return <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
  return <DataTable rows={rows} filename="audit-log.csv" cols={[
    { key: 'ts', label: 'When', render: r => new Date(r.ts).toLocaleString('en-GB') },
    { key: 'user', label: 'User', render: r => <span className="mono text-xs">{r.user}</span> },
    { key: 'action', label: 'Action' }, { key: 'detail', label: 'Detail' },
  ]} />
}

function Demo() {
  const { data, reload } = useApp()
  const [busy, setBusy] = useState('')
  const loaded = (data!.invoices || []).some(i => i.isDemo === 'Y')
  return (
    <Panel title="Demo data" sub="Preview the trends, forecast and hygiene pages before real sales build up" className="max-w-2xl">
      <p className="text-sm">Loads ~6 months of sample invoices, receipts, purchases and expenses for five customers named <b>DEMO …</b>. Demo documents use their own numbers (<span className="mono">DEMO-INV-…</span>) so your real invoice and receipt counters are not touched, and everything tagged demo is removed in one click.</p>
      <div className="flex gap-2 mt-4">
        <Button disabled={!!busy || loaded} onClick={async () => {
          setBusy('load')
          try { const r = await api('loadDemo'); await reload(); toast.success(`Loaded ${r.invoices} demo invoices`) } catch (e) { toast.error((e as Error).message) } finally { setBusy('') }
        }}>{busy === 'load' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Load demo data</Button>
        <Button variant="outline" className="text-bad" disabled={!!busy || !loaded} onClick={async () => {
          if (!confirm('Remove all demo records?')) return
          setBusy('clear')
          try { const r = await api('clearDemo'); await reload(); toast.success(`Removed ${r.removed} demo rows`) } catch (e) { toast.error((e as Error).message) } finally { setBusy('') }
        }}>{busy === 'clear' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Clear demo data</Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Loading can take a minute or two — Google Sheets is writing every row and journal line.</p>
    </Panel>
  )
}

function Connection() {
  const [url, setUrl] = useState(getApiUrl())
  return (
    <Panel title="Database connection" sub="The Apps Script web app in the Myka Quad ERP Google Drive folder" className="max-w-2xl">
      <Field label="Web app URL"><TextInput value={url} onChange={e => setUrl(e.target.value)} /></Field>
      <p className="text-xs text-muted-foreground mt-2">This is saved in this browser only. The default for everyone comes from <span className="mono">config.js</span> in the GitHub repo.</p>
      <Button className="mt-3" onClick={() => { setApiUrl(url); toast.success('Saved — reloading'); setTimeout(() => location.reload(), 600) }}>Save</Button>
    </Panel>
  )
}
