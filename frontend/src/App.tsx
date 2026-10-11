import { Link, Route, Routes } from 'react-router-dom'
import { Protected, Shell } from './components/Layout'
import { ErrorBoundary } from './components/ui'
import { Account } from './pages/Account'
import { CheckIn } from './pages/CheckIn'
import { Concerts } from './pages/Concerts'
import { EventForm } from './pages/EventForm'
import { Halls } from './pages/Halls'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { SalesPage } from './pages/SalesPage'
import { Widget } from './pages/Widget'

export function App() {
  return (
    <ErrorBoundary>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/account"
            element={
              <Protected>
                <Account />
              </Protected>
            }
          />
          <Route path="/widget/:slug" element={<Widget />} />
          <Route
            path="/organizer"
            element={
              <Protected organizer>
                <Concerts />
              </Protected>
            }
          />
          <Route
            path="/organizer/halls"
            element={
              <Protected organizer>
                <Halls />
              </Protected>
            }
          />
          <Route
            path="/organizer/events/new"
            element={
              <Protected organizer>
                <EventForm />
              </Protected>
            }
          />
          <Route
            path="/organizer/events/:id/edit"
            element={
              <Protected organizer>
                <EventForm />
              </Protected>
            }
          />
          <Route
            path="/organizer/sales"
            element={
              <Protected organizer>
                <SalesPage />
              </Protected>
            }
          />
          <Route
            path="/organizer/check-in"
            element={
              <Protected organizer>
                <CheckIn />
              </Protected>
            }
          />
          <Route
            path="*"
            element={
              <div className="empty">
                <h2>Страница не найдена</h2>
                <Link to="/">На главную</Link>
              </div>
            }
          />
        </Routes>
      </Shell>
    </ErrorBoundary>
  )
}
