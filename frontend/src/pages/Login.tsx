import { ArrowRight, Music2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../api'
import { Notice } from '../components/ui'
import { errorText } from '../constants'

export function Login() {
  const { user, login, register } = useAuth(),
    navigate = useNavigate(),
    [query] = useSearchParams()
  const [mode, setMode] = useState(query.get('mode') === 'register' ? 'register' : 'login')
  const [role, setRole] = useState(query.get('role') === 'organizer' ? 'organizer' : 'buyer')
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    setMode(query.get('mode') === 'register' ? 'register' : 'login')
    setRole(query.get('role') === 'organizer' ? 'organizer' : 'buyer')
    setMessage('')
  }, [query])
  const back = query.get('return')
  const destination =
    back?.startsWith('/') && !back.startsWith('//') && !back.startsWith('/login')
      ? back
      : user?.role === 'organizer'
        ? '/organizer'
        : '/'
  if (user) return <Navigate to={destination} replace />
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const data = new FormData(e.currentTarget)
    try {
      const authenticated =
        mode === 'login'
          ? await login(String(data.get('email')), String(data.get('password')))
          : await register({
              email: data.get('email'),
              password: data.get('password'),
              name: data.get('name'),
              role,
            })
      navigate(
        back?.startsWith('/') && !back.startsWith('//') && !back.startsWith('/login')
          ? back
          : authenticated.role === 'organizer'
            ? '/organizer'
            : '/',
      )
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-wrap">
      <div className="auth-story">
        <div className="eyebrow">ОТ ПЕРВОГО РЯДА ДО АНШЛАГА</div>
        <h1>
          Всё начинается
          <br />с одного билета.
        </h1>
        <p>Находите свою музыку, выбирайте места и храните билеты в одном кабинете.</p>
        <div className="auth-visual">
          <Music2 size={80} />
          <span>LIVE / TICKETFLOW</span>
        </div>
      </div>
      <div className="auth-card">
        <h2>{mode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</h2>
        <p className="muted">
          {mode === 'login'
            ? 'Войдите, чтобы продолжить'
            : 'Один аккаунт — все ваши концерты и билеты'}
        </p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div className="segmented">
                <button
                  type="button"
                  className={role === 'buyer' ? 'active' : ''}
                  onClick={() => setRole('buyer')}
                >
                  Покупатель
                </button>
                <button
                  type="button"
                  className={role === 'organizer' ? 'active' : ''}
                  onClick={() => setRole('organizer')}
                >
                  Организатор
                </button>
              </div>
              <label>
                Имя
                <input name="name" autoComplete="name" minLength={2} maxLength={100} required />
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 10 : 1}
              maxLength={128}
              required
              placeholder={mode === 'register' ? 'Минимум 10 символов' : ''}
            />
          </label>
          <Notice message={message} />
          <button className="button primary full" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="small muted">
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже зарегистрированы?'}{' '}
          <button
            className="text-button inline"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setMessage('')
            }}
          >
            {mode === 'login' ? 'Создать' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  )
}
