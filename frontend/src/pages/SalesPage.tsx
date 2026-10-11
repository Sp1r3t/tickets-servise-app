import { BarChart3, Ticket, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Loading, Notice } from '../components/ui'
import { errorText } from '../constants'
import { date, money, type Concert } from '../types'

export function SalesPage() {
  const [rows, setRows] = useState<{ concert: Concert; sales: Sales }[]>([]),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false)
  useEffect(() => {
    api<Concert[]>('/organizer/events')
      .then((c) =>
        Promise.all(
          c
            .filter((x) => x.status === 'published')
            .map(async (concert) => ({
              concert,
              sales: await api<Sales>(`/organizer/events/${concert.id}/sales`),
            })),
        ),
      )
      .then(setRows)
      .catch((e) => setMessage(errorText(e)))
      .finally(() => setReady(true))
  }, [])
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">АНАЛИТИКА</div>
          <h1>Продажи билетов</h1>
          <p className="muted">Показатели опубликованных концертов.</p>
        </div>
      </div>
      <Notice message={message} />
      <div className="stat-grid">
        <div className="stat">
          <Ticket size={20} />
          <span>Продано билетов</span>
          <strong>{rows.reduce((n, r) => n + r.sales.sold, 0)}</strong>
        </div>
        <div className="stat">
          <BarChart3 size={20} />
          <span>Тестовая выручка</span>
          <strong>{money(rows.reduce((n, r) => n + r.sales.revenue, 0))}</strong>
        </div>
        <div className="stat">
          <Users size={20} />
          <span>Прошли на концерт</span>
          <strong>{rows.reduce((n, r) => n + r.sales.checked_in, 0)}</strong>
        </div>
      </div>
      {!ready ? (
        <Loading />
      ) : (
        <div className="panel">
          <div className="panel-heading">
            <h3>По концертам</h3>
          </div>
          {rows.length ? (
            rows.map(({ concert: c, sales: s }) => (
              <div className="event-row" key={c.id}>
                <div className="event-info">
                  <strong>{c.details.title}</strong>
                  <p>{date(c.details.starts_at, c.details.timezone)}</p>
                </div>
                <span>Продано: {s.sold}</span>
                <span>В брони: {s.pending}</span>
                <strong>{money(s.revenue)}</strong>
              </div>
            ))
          ) : (
            <div className="empty muted">Опубликуйте концерт, чтобы видеть продажи.</div>
          )}
        </div>
      )}
    </>
  )
}
type Sales = { sold: number; revenue: number; checked_in: number; pending: number }
