import {
  Armchair,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Ticket,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, post, useAuth } from '../api'
import { SeatMap } from '../components/SeatMap'
import { Countdown, TicketCard } from '../components/Tickets'
import { Loading, Notice } from '../components/ui'
import { errorText, labels } from '../constants'
import {
  date,
  levelOf,
  levelsOf,
  money,
  newId,
  type Concert,
  type Order,
  type Stock,
} from '../types'

export function Widget() {
  const { slug } = useParams(),
    { user, ready } = useAuth()
  const [concert, setConcert] = useState<Concert | null>(null),
    [stock, setStock] = useState<Stock | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [order, setOrder] = useState<Order | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState(1)
  const requestKey = useRef<{ signature: string; id: string } | null>(null)
  useEffect(() => {
    setMessage('')
    api<Concert>(`/widgets/${slug}`)
      .then(setConcert)
      .catch((e) => setMessage(errorText(e)))
  }, [slug])
  useEffect(() => {
    if (!concert) return
    let active = true
    const reload = () =>
      api<Stock>(`/inventory/${concert.id}`)
        .then((s) => {
          if (active) setStock(s)
        })
        .catch((e) => {
          if (active) setMessage(errorText(e))
        })
    void reload()
    const timer = setInterval(() => void reload(), 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [concert])
  useEffect(() => {
    if (!order || !['creating', 'pending'].includes(order.state)) return
    const timer = setInterval(() => {
      api<Order>(`/orders/${order.id}`)
        .then(setOrder)
        .catch((e) => setMessage(errorText(e)))
    }, 3000)
    return () => clearInterval(timer)
  }, [order?.id, order?.state])
  const states = Object.fromEntries(stock?.seats.map((s) => [s.id, s.state]) || [])
  const embedded = window.self !== window.top
  async function reserve() {
    if (!concert) return
    setBusy(true)
    setMessage('')
    const signature = `${concert.id}:${[...selected].sort().join(',')}`
    if (requestKey.current?.signature !== signature) requestKey.current = { signature, id: newId() }
    try {
      const result = await post<Order>(
        '/orders',
        { event_id: concert.id, seat_ids: selected },
        { 'Idempotency-Key': requestKey.current!.id },
      )
      setOrder(result)
      if (result.state === 'failed') {
        setMessage('Одно из мест уже занято. Выберите другие места.')
        requestKey.current = null
      }
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function pay() {
    if (!order) return
    setBusy(true)
    setMessage('')
    try {
      const payment = await post<{ id: string }>(`/orders/${order.id}/checkout`)
      await post(`/payments/${payment.id}/confirm`)
      setOrder(await api<Order>(`/orders/${order.id}`))
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    if (!order) return
    setBusy(true)
    try {
      await post(`/orders/${order.id}/cancel`)
      setOrder(null)
      setSelected([])
      requestKey.current = null
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  if (!concert || !ready)
    return message ? (
      <div className="empty">
        <Notice message={message} />
        <Link to="/" className="button secondary">
          На главную
        </Link>
      </div>
    ) : (
      <Loading />
    )
  const d = concert.details,
    layout = concert.layout!
  const total = selected.reduce(
    (n, id) => n + (stock?.seats.find((s) => s.id === id)?.price || 0),
    0,
  )
  const seats = layout.seats.filter((s) => selected.includes(s.id))
  const canChoose = !order || !['pending', 'creating', 'paid'].includes(order.state)
  return (
    <div className="widget">
      <div className="widget-topbar">
        <Link className="brand" to="/">
          <Ticket size={23} />
          ticketflow.
        </Link>
        <span className="small muted">Защищённое бронирование</span>
        <Link className="text-button" target={embedded ? '_blank' : undefined} to="/account">
          Мои билеты
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="widget-header">
        <div className="eyebrow">
          {d.artist} · {d.age_limit}+
        </div>
        <h1>{d.title}</h1>
        <div className="event-meta">
          <span>
            <CalendarDays size={17} />
            {date(d.starts_at, d.timezone)}
          </span>
          <span>
            <MapPin size={17} />
            {d.city}, {d.venue}
          </span>
        </div>
      </div>
      <Notice message={message} />
      {order?.state === 'paid' ? (
        <div className="purchase-success">
          <CheckCircle2 size={40} />
          <h2>Билеты у вас!</h2>
          <p className="muted">Тестовая покупка завершена. Билеты сохранены в личном кабинете.</p>
          {order.tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} event={d} />
          ))}
          <Link className="button primary" to="/account" target={embedded ? '_blank' : undefined}>
            Все мои билеты
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="widget-grid">
          <div>
            <div className="panel">
              <div className="panel-heading">
                <h3>Выберите места</h3>
                <div className="zoom-control">
                  <button
                    className="icon-button"
                    aria-label="Уменьшить схему"
                    onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                  >
                    −
                  </button>
                  <button className="text-button" onClick={() => setZoom(1)}>
                    {zoom * 100}%
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Увеличить схему"
                    onClick={() => setZoom(Math.min(3, zoom + 0.5))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="widget-map-scroll">
                <div style={{ width: `${zoom * 100}%`, minWidth: '500px' }}>
                  <SeatMap
                    layout={layout}
                    states={states}
                    selected={selected}
                    onSelect={
                      stock?.sales_open && canChoose
                        ? (id) => {
                            setMessage('')
                            setSelected((s) =>
                              s.includes(id)
                                ? s.filter((x) => x !== id)
                                : s.length < 8
                                  ? [...s, id]
                                  : s,
                            )
                            if (order) setOrder(null)
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
              <div className="legend">
                {layout.categories.map((c) => (
                  <span key={c.id}>
                    <i style={{ background: c.color }} />
                    {c.name} · {money(c.price)}
                  </span>
                ))}
                <span>
                  <i style={{ background: '#d8dbe3' }} />
                  Занято
                </span>
              </div>
            </div>
            <div className="event-description">
              <h3>О концерте</h3>
              <p>{d.description}</p>
              <p className="small muted">
                Открытие дверей: {date(d.doors_at, d.timezone)} · {d.address}
              </p>
              <details>
                <summary>Организатор и условия возврата</summary>
                <p>
                  {d.organizer_name} · <a href={`mailto:${d.contact_email}`}>{d.contact_email}</a>
                </p>
                <p>{d.refund_policy}</p>
              </details>
            </div>
          </div>
          <aside className="checkout panel">
            <div className="eyebrow">ВАШ ЗАКАЗ</div>
            <h2>
              {selected.length
                ? `${selected.length} ${selected.length === 1 ? 'билет' : 'билета'}`
                : 'Выберите билет'}
            </h2>
            {seats.length ? (
              seats.map((s) => (
                <div className="checkout-item" key={s.id}>
                  <div>
                    <strong>
                      {levelsOf(layout).find((l) => l.id === levelOf(s))?.name} · {s.section}
                    </strong>
                    <p>
                      Ряд {s.row} · Место {s.number}
                      {s.accessible ? ' · ♿' : ''}
                    </p>
                  </div>
                  <strong>{money(stock?.seats.find((x) => x.id === s.id)?.price || 0)}</strong>
                </div>
              ))
            ) : (
              <div className="checkout-empty">
                <Armchair size={30} />
                <p>
                  Нажмите на свободное место
                  <br />
                  на схеме зала
                </p>
              </div>
            )}
            <hr />
            <div className="checkout-total">
              <span>Итого</span>
              <strong>
                {money(
                  order && ['pending', 'creating'].includes(order.state) ? order.amount : total,
                )}
              </strong>
            </div>
            <p className="small muted">Сервисный сбор: 0 ₽. До 8 билетов в одном заказе.</p>
            {stock && !stock.sales_open && canChoose ? (
              <Notice message="Продажа на этот концерт завершена" />
            ) : !user ? (
              <>
                <Link
                  className="button primary full"
                  to={
                    embedded
                      ? `/widget/${slug}`
                      : `/login?return=${encodeURIComponent(`/widget/${slug}`)}`
                  }
                  target={embedded ? '_blank' : undefined}
                >
                  {embedded ? 'Открыть покупку в новой вкладке' : 'Войти для бронирования'}
                </Link>
                <p className="small muted">Войдите, чтобы билеты сохранились в вашем кабинете.</p>
              </>
            ) : order?.state === 'pending' ? (
              <>
                <Countdown
                  expires={order.expires_at}
                  serverTime={order.server_time}
                  onExpire={() =>
                    api<Order>(`/orders/${order.id}`)
                      .then(setOrder)
                      .catch((e) => setMessage(errorText(e)))
                  }
                />
                <div className="demo-payment">
                  Демонстрационная оплата
                  <br />
                  <span>Деньги не списываются</span>
                </div>
                <button className="button primary full" disabled={busy} onClick={() => void pay()}>
                  {busy ? 'Обработка…' : 'Оплатить в тестовом режиме'}
                  <ArrowRight size={16} />
                </button>
                <button className="text-button full" disabled={busy} onClick={() => void cancel()}>
                  Отменить бронь
                </button>
              </>
            ) : order?.state === 'creating' ? (
              <Notice message="Бронь создаётся. Подождите несколько секунд." />
            ) : (
              <>
                <button
                  className="button primary full"
                  disabled={busy || !selected.length || !stock?.sales_open}
                  onClick={() => void reserve()}
                >
                  {busy ? 'Бронируем…' : 'Забронировать на 10 минут'}
                  <ArrowRight size={16} />
                </button>
                {order && <Notice message={labels[order.state]} />}
              </>
            )}
            <div className="checkout-security">
              <ShieldCheck size={16} />
              <span>Цена фиксируется на время брони</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
