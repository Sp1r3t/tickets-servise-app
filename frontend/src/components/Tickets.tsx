import { Copy } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { Notice } from '../components/ui'
import { errorText } from '../constants'
import { date, money, type EventDetails, type Ticket as TicketType } from '../types'

export function TicketCard({ ticket, event }: { ticket: TicketType; event: EventDetails }) {
  const [qr, setQr] = useState(''),
    [copied, setCopied] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    QRCode.toDataURL(ticket.code, { width: 180, margin: 1 })
      .then(setQr)
      .catch((e) => setMessage(errorText(e)))
  }, [ticket.code])
  async function copy() {
    try {
      await navigator.clipboard.writeText(ticket.code)
      setCopied(true)
    } catch {
      setMessage('Копирование недоступно в этом браузере')
    }
  }
  return (
    <div className="ticket-card">
      <div className="ticket-content">
        <span className="eyebrow">ЭЛЕКТРОННЫЙ БИЛЕТ · DEMO</span>
        <h3>{event.title}</h3>
        <p>
          {date(event.starts_at, event.timezone)} · {event.venue}
        </p>
        <div className="ticket-place">
          <span>
            {ticket.item.level ? `${ticket.item.level} · ` : ''}
            {ticket.item.section}
          </span>
          <strong>Ряд {ticket.item.row}</strong>
          <strong>Место {ticket.item.number}</strong>
        </div>
        <p className="small muted">
          {event.address} · {event.age_limit}+ · {money(ticket.item.price)}
        </p>
        <span className="badge green">
          {ticket.checked_in_at ? 'Вход отмечен' : 'Действителен'}
        </span>
        <button className="text-button small no-print" onClick={() => void copy()}>
          <Copy size={13} />
          {copied ? 'Скопировано' : 'Код для проверки входа'}
        </button>
        <Notice message={message} />
      </div>
      <div className="ticket-qr">
        {qr && (
          <img
            src={qr}
            alt={`QR-код билета, ряд ${ticket.item.row}, место ${ticket.item.number}`}
          />
        )}
        <span>{ticket.id.slice(0, 8).toUpperCase()}</span>
      </div>
    </div>
  )
}

export function Countdown({
  expires,
  serverTime,
  onExpire,
}: {
  expires: number
  serverTime: number
  onExpire?: () => void
}) {
  const [remaining, setRemaining] = useState(Math.max(0, expires - serverTime))
  const fired = useRef(false),
    callback = useRef(onExpire)
  callback.current = onExpire
  useEffect(() => {
    const started = Date.now()
    fired.current = false
    const tick = () => {
      const value = Math.max(0, expires - serverTime - Math.floor((Date.now() - started) / 1000))
      setRemaining(value)
      if (value === 0 && !fired.current) {
        fired.current = true
        callback.current?.()
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expires, serverTime])
  return (
    <span className="countdown">
      Бронь {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
    </span>
  )
}
