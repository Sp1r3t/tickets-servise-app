import {
  Armchair,
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Music2,
  Plus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, post } from '../api'
import { Loading, Notice } from '../components/ui'
import { errorText, labels } from '../constants'
import { date, type Concert, type Hall } from '../types'

export function Concerts() {
  const [concerts, setConcerts] = useState<Concert[]>([]),
    [halls, setHalls] = useState<Hall[]>([]),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')
  function reload() {
    return Promise.all([api<Concert[]>('/organizer/events'), api<Hall[]>('/halls')])
      .then(([c, h]) => {
        setConcerts(c)
        setHalls(h)
      })
      .catch((e) => setMessage(errorText(e)))
      .finally(() => setReady(true))
  }
  useEffect(() => {
    void reload()
  }, [])
  async function publish(id: string) {
    setBusy(id)
    setMessage('')
    try {
      await post(`/organizer/events/${id}/publish`)
      await reload()
    } catch (e) {
      setMessage(errorText(e))
      await reload()
    } finally {
      setBusy('')
    }
  }
  async function copy(c: Concert, embed = false) {
    try {
      const url = `${location.origin}/widget/${c.slug}`
      await navigator.clipboard.writeText(
        embed
          ? `<iframe src="${url}" title="Покупка билетов" width="100%" height="900" style="border:0" loading="lazy"></iframe>`
          : url,
      )
      setCopied(`${c.id}:${embed}`)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setMessage('Копирование недоступно. Откройте виджет и скопируйте адрес из браузера.')
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">КАБИНЕТ ОРГАНИЗАТОРА</div>
          <h1>
            Ваши концерты<span className="count-badge">{concerts.length}</span>
          </h1>
          <p className="muted">Управляйте событиями — от первой схемы до последнего билета.</p>
        </div>
        <Link className="button primary" to="/organizer/events/new">
          <Plus size={17} />
          Создать концерт
        </Link>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <CalendarDays size={20} />
          <span>Всего концертов</span>
          <strong>{concerts.length}</strong>
        </div>
        <div className="stat">
          <span className="status-dot" />
          <span>В продаже</span>
          <strong>{concerts.filter((c) => c.status === 'published').length}</strong>
        </div>
        <div className="stat">
          <Armchair size={20} />
          <span>Схем залов</span>
          <strong>{halls.length}</strong>
        </div>
      </div>
      <Notice message={message} />
      {!ready ? (
        <Loading />
      ) : !concerts.length ? (
        <div className="onboarding">
          <div className="onboarding-icon">
            <Music2 size={35} />
          </div>
          <h2>Начнём с вашего первого концерта</h2>
          <p className="muted">Три шага, чтобы открыть продажи билетов</p>
          <div className="onboarding-steps">
            <Link to="/organizer/halls">
              <span>01</span>
              <strong>Создайте зал</strong>
              <p>Нарисуйте схему и назначьте цены</p>
              <ArrowRight size={18} />
            </Link>
            <Link to="/organizer/events/new">
              <span>02</span>
              <strong>Заполните концерт</strong>
              <p>Артист, площадка, время и условия</p>
              <ArrowRight size={18} />
            </Link>
            <div>
              <span>03</span>
              <strong>Опубликуйте виджет</strong>
              <p>Получите ссылку и начните продажи</p>
              <Check size={18} />
            </div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-heading">
            <h3>Все концерты</h3>
            <span className="small muted">Схема фиксируется при публикации</span>
          </div>
          {concerts.map((c) => (
            <div className="event-row" key={c.id}>
              <div className="event-icon">
                <Music2 size={23} />
              </div>
              <div className="event-info">
                <strong>{c.details.title}</strong>
                <p>
                  {date(c.details.starts_at, c.details.timezone)} · {c.details.venue}
                </p>
              </div>
              <span className={`badge ${c.status === 'published' ? 'green' : ''}`}>
                {labels[c.status || 'draft']}
              </span>
              <div className="event-actions">
                {c.status === 'published' ? (
                  <>
                    <button className="button secondary small" onClick={() => void copy(c)}>
                      <Copy size={14} />
                      {copied === `${c.id}:false` ? 'Скопировано' : 'Ссылка'}
                    </button>
                    <button className="button secondary small" onClick={() => void copy(c, true)}>
                      Код виджета
                    </button>
                    <Link
                      className="icon-button"
                      aria-label="Открыть виджет"
                      to={`/widget/${c.slug}`}
                    >
                      <ExternalLink size={17} />
                    </Link>
                  </>
                ) : (
                  <>
                    {c.status === 'draft' && (
                      <Link className="text-button" to={`/organizer/events/${c.id}/edit`}>
                        Изменить
                      </Link>
                    )}
                    <button
                      className="button primary small"
                      disabled={busy === c.id}
                      onClick={() => void publish(c.id)}
                    >
                      {busy === c.id
                        ? 'Публикация…'
                        : c.status === 'publishing'
                          ? 'Повторить публикацию'
                          : 'Опубликовать'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
