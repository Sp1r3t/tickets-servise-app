import {
  Armchair,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Music2,
  ScanLine,
  ShieldCheck,
  Ticket,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../api'
import { Loading } from '../components/ui'
import { errorText } from '../constants'

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate(),
    location = useLocation()
  if (location.pathname.startsWith('/widget/')) return <>{children}</>
  const isOrganizer = user?.role === 'organizer' && location.pathname.startsWith('/organizer')
  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Ticket size={22} />
          </span>
          ticketflow<span className="brand-dot">.</span>
        </Link>
        <span className="topbar-tag">Билетная платформа</span>
        <div className="spacer" />
        {user ? (
          <>
            <Link className="user-link" to={user.role === 'organizer' ? '/organizer' : '/account'}>
              <span className="avatar">{user.name.slice(0, 1)}</span>
              {user.name}
            </Link>
            <button
              className="icon-button"
              aria-label="Выйти"
              onClick={() =>
                void logout()
                  .then(() => navigate('/'))
                  .catch((e) => alert(errorText(e)))
              }
            >
              <LogOut size={17} />
            </button>
          </>
        ) : (
          <div className="header-auth">
            <Link className="button secondary" to="/login">
              Войти
            </Link>
            <Link className="button primary" to="/login?mode=register">
              Зарегистрироваться
            </Link>
          </div>
        )}
      </header>
      <div className={isOrganizer ? 'app-layout' : ''}>
        {isOrganizer && (
          <aside className="sidebar">
            <div className="workspace">
              <span className="workspace-icon">
                <Music2 size={20} />
              </span>
              <div>
                <strong>Моя организация</strong>
                <div className="small muted">Кабинет организатора</div>
              </div>
            </div>
            <div className="eyebrow nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
            <nav>
              <NavLink end to="/organizer">
                <LayoutDashboard size={18} />
                Концерты
              </NavLink>
              <NavLink to="/organizer/halls">
                <Armchair size={18} />
                Залы и схемы
              </NavLink>
              <NavLink to="/organizer/sales">
                <BarChart3 size={18} />
                Продажи
              </NavLink>
              <NavLink to="/organizer/check-in">
                <ScanLine size={18} />
                Контроль входа
              </NavLink>
              <NavLink to="/account">
                <Ticket size={18} />
                Мои билеты
              </NavLink>
            </nav>
            <div className="sidebar-bottom">
              <ShieldCheck size={18} />
              <div>
                <strong>Тестовая среда</strong>
                <p>
                  Платежи демонстрационные.
                  <br />
                  Реальные деньги не списываются.
                </p>
              </div>
            </div>
          </aside>
        )}
        <main className={isOrganizer ? 'workspace-main' : 'public-main'}>{children}</main>
      </div>
    </>
  )
}

export function Protected({
  organizer = false,
  children,
}: {
  organizer?: boolean
  children: ReactNode
}) {
  const { user, ready } = useAuth(),
    location = useLocation()
  if (!ready) return <Loading />
  if (!user)
    return <Navigate to={`/login?return=${encodeURIComponent(location.pathname)}`} replace />
  if (organizer && user.role !== 'organizer') return <Navigate to="/account" replace />
  return children
}
