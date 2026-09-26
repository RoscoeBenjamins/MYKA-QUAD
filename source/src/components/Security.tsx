import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useApp } from '@/lib/store'
import { api } from '@/lib/api'
import type { LoginResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/kit'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, Copy, Download, Smartphone, KeyRound } from 'lucide-react'

type Pending = Extract<LoginResult, { mfa: 'verify' | 'enroll' }>

function CodeInput({ value, onChange, recovery }: { value: string; onChange: (v: string) => void; recovery?: boolean }) {
  return (
    <TextInput autoFocus inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code"
      placeholder={recovery ? 'XXXXX-XXXXX' : '123 456'} maxLength={recovery ? 11 : 7}
      className="mono text-lg tracking-[0.3em] h-11 text-center"
      value={value} onChange={e => onChange(recovery ? e.target.value.toUpperCase() : e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
  )
}

/** Second step of sign-in: set up an authenticator (first time) or enter its code. */
export function MfaStep({ pending, onCancel }: { pending: Pending; onCancel: () => void }) {
  const { verify2fa } = useApp()
  const [code, setCode] = useState('')
  const [qr, setQr] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (pending.mfa === 'enroll') QRCode.toDataURL(pending.otpauth, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then(setQr)
  }, [pending])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await verify2fa(pending.challenge, code) } catch (x) { setErr((x as Error).message); setCode('') } finally { setBusy(false) }
  }
  const secretGrouped = pending.mfa === 'enroll' ? pending.secret.replace(/(.{4})/g, '$1 ').trim() : ''
  return (
    <form className="w-full max-w-sm" onSubmit={submit}>
      <div className="flex items-center gap-2 text-brand mb-2"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold tracking-widest uppercase">2-step verification</span></div>
      {pending.mfa === 'enroll' ? (
        <>
          <h2 className="text-2xl font-extrabold">Set up your authenticator</h2>
          <ol className="text-sm text-muted-foreground mt-2 space-y-1.5 list-decimal pl-5">
            <li>Open <b className="text-foreground">Google Authenticator</b> or <b className="text-foreground">Microsoft Authenticator</b> on your phone.</li>
            <li>Tap <b className="text-foreground">+</b> → <b className="text-foreground">Scan a QR code</b> and scan this code.</li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <div className="flex justify-center my-4">
            {qr ? <img src={qr} alt="QR code for your authenticator app" className="border rounded bg-white p-2 h-[236px] w-[236px]" /> : <div className="h-[236px] w-[236px] grid place-items-center"><Loader2 className="animate-spin" /></div>}
          </div>
          <details className="text-xs text-muted-foreground mb-4">
            <summary className="cursor-pointer">Can't scan? Enter this key instead</summary>
            <div className="mt-2 mono text-sm text-foreground bg-secondary rounded px-2 py-1.5 break-all select-all">{secretGrouped}</div>
            <div className="mt-1">Account: Myka Quad · Type: time-based</div>
          </details>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-extrabold">{useRecovery ? 'Use a recovery code' : 'Enter your code'}</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {useRecovery ? 'Enter one of the recovery codes you saved when you set up 2-step verification. Each code works once.'
              : <>Open your authenticator app and type the 6-digit code for <b className="text-foreground">Myka Quad</b>.</>}
          </p>
        </>
      )}
      <Field label={useRecovery ? 'Recovery code' : '6-digit code'}><CodeInput value={code} onChange={setCode} recovery={useRecovery} /></Field>
      {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded px-3 py-2 mt-3">{err}</div>}
      <Button className="w-full mt-4" disabled={busy || (useRecovery ? code.replace(/[^A-Z0-9]/g, '').length !== 10 : code.length !== 6)}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{pending.mfa === 'enroll' ? 'Turn on & continue' : 'Verify'}
      </Button>
      <div className="flex justify-between mt-4 text-xs">
        <button type="button" className="text-muted-foreground underline" onClick={onCancel}>Back to sign in</button>
        {pending.mfa === 'verify' && (
          <button type="button" className="text-muted-foreground underline" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setErr('') }}>
            {useRecovery ? 'Use authenticator code' : 'Lost your phone? Use a recovery code'}
          </button>
        )}
      </div>
    </form>
  )
}

function saveCodes(codes: string[]) {
  const text = `Myka Quad ERP — recovery codes\nGenerated ${new Date().toLocaleString('en-GB')}\n\nEach code works once if you lose your phone.\n\n${codes.join('\n')}\n`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = 'myka-quad-recovery-codes.txt'; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-2 text-ok mb-2"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold tracking-widest uppercase">2-step verification is on</span></div>
      <h2 className="text-2xl font-extrabold">Save your recovery codes</h2>
      <p className="text-sm text-muted-foreground mt-1">If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe and private — they won't be shown again.</p>
      <div className="grid grid-cols-2 gap-2 my-5 bg-secondary/60 border rounded p-4">
        {codes.map(c => <div key={c} className="mono text-sm font-semibold tracking-wider text-center">{c}</div>)}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => { saveCodes(codes); setSaved(true) }}><Download className="h-4 w-4 mr-1.5" />Download</Button>
        <Button variant="outline" className="flex-1" onClick={async () => { try { await navigator.clipboard.writeText(codes.join('\n')); setSaved(true); toast.success('Copied') } catch { toast.error('Copy failed — use Download') } }}><Copy className="h-4 w-4 mr-1.5" />Copy</Button>
      </div>
      <label className="flex items-center gap-2 text-sm mt-4"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /> I've saved my recovery codes</label>
      <Button className="w-full mt-4" disabled={!saved} onClick={onDone}>Continue</Button>
    </div>
  )
}

/** Self-service: shows 2FA status and lets the user replace their recovery codes. */
export function SecurityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, showRecovery } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setCode('') }, [open])
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Account security</DialogTitle></DialogHeader>
        <div className="flex items-start gap-3 rounded border p-3">
          <Smartphone className="h-5 w-5 mt-0.5 text-brand" />
          <div className="text-sm">
            <div className="font-semibold">2-step verification: {user?.twoFactor === 'on' ? 'On' : 'Off'}</div>
            <div className="text-muted-foreground">Signing in asks for a code from Google or Microsoft Authenticator. Lost your phone? Use a recovery code, or ask an admin to reset your 2-step verification.</div>
          </div>
        </div>
        {user?.twoFactor === 'on' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm"><KeyRound className="h-4 w-4" />New recovery codes</div>
            <p className="text-xs text-muted-foreground">Replaces all your old recovery codes. Enter a code from your authenticator to confirm.</p>
            <CodeInput value={code} onChange={setCode} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {user?.twoFactor === 'on' && <Button disabled={busy || code.length !== 6} onClick={async () => {
            setBusy(true)
            try { const r = await api<{ recoveryCodes: string[] }>('regenerateRecovery', { code }); onClose(); showRecovery(r.recoveryCodes) }
            catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Generate new codes</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
