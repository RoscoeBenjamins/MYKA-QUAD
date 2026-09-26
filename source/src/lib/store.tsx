import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, AuthError, getToken, setToken } from './api'
import type { Bootstrap, LoginResult, Module, User } from './types'

interface Ctx {
  data: Bootstrap | null
  user: User | null
  loading: boolean
  error: string
  reload: () => Promise<void>
  login: (u: string, p: string) => Promise<LoginResult>
  verify2fa: (challenge: string, code: string) => Promise<LoginResult>
  recoveryCodes: string[] | null
  clearRecovery: () => void
  showRecovery: (codes: string[]) => void
  logout: () => Promise<void>
  setUser: (u: User) => void
  can: (m: Module) => boolean
  canWrite: boolean
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [loading, setLoading] = useState(!!getToken())
  const [error, setError] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  const reload = useCallback(async () => {
    if (!getToken()) { setData(null); setLoading(false); return }
    try {
      const b = await api<Bootstrap>('bootstrap')
      setData(b); setError('')
    } catch (e) {
      if (e instanceof AuthError) { setData(null); setError(e.message) }
      else setError((e as Error).message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const finish = async (r: LoginResult) => {
    if ('token' in r && r.token) {
      setToken(r.token)
      if (r.recoveryCodes?.length) setRecoveryCodes(r.recoveryCodes)
      setLoading(true)
      await reload()
    }
    return r
  }
  const login = async (username: string, password: string) => finish(await api<LoginResult>('login', { username, password }))
  const verify2fa = async (challenge: string, code: string) => finish(await api<LoginResult>('verify2fa', { challenge, code }))
  const logout = async () => {
    try { await api('logout') } catch { /* already gone */ }
    setToken(null); setData(null)
  }
  const user = data?.user || null
  const can = (m: Module) => !!user && (user.role === 'admin' || user.modules.includes(m))
  return (
    <AppCtx.Provider value={{
      data, user, loading, error, reload, login, logout, verify2fa,
      recoveryCodes, clearRecovery: () => setRecoveryCodes(null), showRecovery: (c) => setRecoveryCodes(c),
      setUser: (u) => setData(d => (d ? { ...d, user: u } : d)),
      can, canWrite: !!user && user.role !== 'viewer',
    }}>{children}</AppCtx.Provider>
  )
}

// ---- tiny hash router ----
export function useRoute() {
  const get = () => (window.location.hash.replace(/^#/, '') || '/dashboard')
  const [route, setRoute] = useState(get)
  useEffect(() => {
    const on = () => setRoute(get())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
export const go = (path: string) => { window.location.hash = path }
