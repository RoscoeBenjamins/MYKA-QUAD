// Talks to the Myka Quad API (Vercel function /api, database in Supabase Postgres).
// POST with text/plain keeps requests "simple" (no CORS preflight).

declare global { interface Window { MYKA_CONFIG?: { apiUrl?: string } } }

const URL_KEY = 'myka.apiUrl'
const TOKEN_KEY = 'myka.token'

function safeGet(k: string) { try { return localStorage.getItem(k) } catch { return null } }
function safeSet(k: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode */ }
}

export function getApiUrl(): string {
  return safeGet(URL_KEY) || window.MYKA_CONFIG?.apiUrl || ''
}
export function setApiUrl(url: string) { safeSet(URL_KEY, url.trim() || null) }

let token: string | null = safeGet(TOKEN_KEY)
export function getToken() { return token }
export function setToken(t: string | null) { token = t; safeSet(TOKEN_KEY, t) }

export class AuthError extends Error {}

export async function api<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const url = getApiUrl()
  if (!url) throw new Error('The app is not connected to its database yet.')
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token }),
      redirect: 'follow',
    })
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.')
  }
  let body: { ok: boolean; data?: T; error?: string }
  try { body = await res.json() } catch { throw new Error('The server returned an unexpected response. Please try again in a moment.') }
  if (!body.ok) {
    const msg = body.error || 'Request failed'
    if (msg.startsWith('AUTH:')) { setToken(null); throw new AuthError(msg.slice(5).trim()) }
    throw new Error(msg)
  }
  return body.data as T
}
