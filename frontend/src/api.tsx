import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from './types'

let accessToken: string | null = null
let refreshFlight: Promise<AuthResult> | null = null
type AuthResult = { access_token: string; user: User }
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/v1' + path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверьте подключение и повторите запрос.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = result.detail
    throw new ApiError(
      response.status,
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((x: { loc: string[]; msg: string }) => `${x.loc.slice(1).join('.')}: ${x.msg}`)
              .join('; ')
          : 'Не удалось выполнить запрос',
    )
  }
  return result
}
function refresh() {
  if (!refreshFlight)
    refreshFlight = raw<AuthResult>('/auth/refresh', { method: 'POST' })
      .then((result) => {
        accessToken = result.access_token
        return result
      })
      .finally(() => {
        refreshFlight = null
      })
  return refreshFlight
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await raw<T>(path, init)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !path.startsWith('/auth/')) {
      await refresh()
      return raw<T>(path, init)
    }
    throw error
  }
}
export const post = <T,>(path: string, body?: unknown, headers?: Record<string, string>) =>
  api<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  })

type AuthContext = {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<User>
  register: (body: unknown) => Promise<User>
  logout: () => Promise<void>
}
const Auth = createContext<AuthContext>(null!)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    refresh()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])
  async function authenticate(path: string, body: unknown) {
    const result = await post<AuthResult>(path, body)
    accessToken = result.access_token
    setUser(result.user)
    return result.user
  }
  async function logout() {
    await post('/auth/logout')
    accessToken = null
    setUser(null)
  }
  return (
    <Auth.Provider
      value={{
        user,
        ready,
        login: (email, password) => authenticate('/auth/login', { email, password }),
        register: (body) => authenticate('/auth/register', body),
        logout,
      }}
    >
      {children}
    </Auth.Provider>
  )
}
export const useAuth = () => useContext(Auth)
