import { ArrowRight, Ticket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, post, useAuth } from '../api'
import { Countdown, TicketCard } from '../components/Tickets'
import { Loading, Notice } from '../components/ui'
import { errorText, labels } from '../constants'
import { money, type Order } from '../types'

export function Account() {
  const [orders, setOrders] = useState<Order[]>([]),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState('')
  const { user } = useAuth()
  function reload() {
    return api<Order[]>('/orders')
      .then(setOrders)
      .catch((e) => setMessage(errorText(e)))
      .finally(() => setReady(true))
  }
  useEffect(() => {
    void reload()
  }, [])
  async function cancel(id: string) {
    setBusy(id)
    try {
      await post(`/orders/${id}/cancel`)
      await reload()
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy('')
    }
  }
  async function pay(id: string) {
    setBusy(id)
    try {
      const payment = await post<{ id: string }>(`/orders/${id}/checkout`)
      await post(`/payments/${payment.id}/confirm`)
      await reload()
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="account">
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">КАБИНЕТ ПОКУПАТЕЛЯ</div>
          <h1>Мои билеты</h1>
          <p className="muted">{user?.name}, здесь хранятся ваши заказы и электронные билеты.</p>
        </div>
        <button className="button secondary" onClick={() => window.print()}>
          Распечатать билеты
        </button>
      </div>
      <Notice message={message} />
      {!ready ? (
        <Loading />
      ) : !orders.length ? (
        <div className="empty">
          <Ticket size={34} />
          <h2>Ваш первый концерт впереди</h2>
          <Link className="button primary" to="/">
            Выбрать концерт
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        orders.map((o) => (
          <section className="order-section" key={o.id}>
            <div className="order-heading no-print">
              <div>
                <strong>{o.event_snapshot.title}</strong>
                <p className="small muted">
                  Заказ {o.id.slice(0, 8)} · {money(o.amount)}
                </p>
              </div>
              <span className={`badge ${o.state === 'paid' ? 'green' : ''}`}>
                {labels[o.state]}
              </span>
              {o.state === 'pending' && (
                <>
                  <Countdown
                    expires={o.expires_at}
                    serverTime={o.server_time}
                    onExpire={() => void reload()}
                  />
                  <button
                    className="button primary small"
                    disabled={busy === o.id}
                    onClick={() => void pay(o.id)}
                  >
                    Тестовая оплата
                  </button>
                  <button
                    className="text-button"
                    disabled={busy === o.id}
                    onClick={() => void cancel(o.id)}
                  >
                    Отменить бронь
                  </button>
                </>
              )}
            </div>
            {o.tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} event={o.event_snapshot} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
