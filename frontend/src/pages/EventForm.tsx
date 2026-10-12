import { ArrowRight, Check } from 'lucide-react'
import { useEffect, useState, useRef, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, post, useAuth } from '../api'
import { HallLibrary } from '../components/HallLibrary'
import { Loading, Notice } from '../components/ui'
import { errorText } from '../constants'
import { genres, type Concert, type EventDetails, type Hall } from '../types'

export function EventForm() {
  const { user } = useAuth(),
    { id } = useParams(),
    navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [copiedHall, setCopiedHall] = useState<Hall | null>(null)
  const [halls, setHalls] = useState<Hall[]>([]),
    [details, setDetails] = useState<EventDetails | null>(null),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    Promise.all([
      api<Hall[]>('/halls'),
      id ? api<Concert[]>('/organizer/events') : Promise.resolve([]),
    ])
      .then(([h, c]) => {
        setHalls(h)
        if (id) {
          const found = c.find((x) => x.id === id)
          if (!found || found.status !== 'draft') throw new Error('Черновик не найден')
          setDetails(found.details)
        }
      })
      .catch((e) => setMessage(errorText(e)))
      .finally(() => setReady(true))
  }, [id])
  function local(value?: string) {
    const time = value ? new Date(value) : new Date(Date.now() + 30 * 86400000)
    return new Date(time.getTime() + 3 * 3600000).toISOString().slice(0, 16)
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const f = new FormData(e.currentTarget)
    const body = Object.fromEntries(f.entries())
    const payload = {
      ...body,
      starts_at: `${body.starts_at}:00+03:00`,
      doors_at: `${body.doors_at}:00+03:00`,
      timezone: 'Europe/Moscow',
      age_limit: Number(body.age_limit),
      poster_url: body.poster_url || null,
    }
    try {
      if (id) await api(`/organizer/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      else await post('/organizer/events', payload)
      navigate('/organizer')
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  if (!ready) return <Loading />
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ПОДГОТОВКА К ПРОДАЖАМ</div>
          <h1>{id ? 'Редактирование концерта' : 'Новый концерт'}</h1>
          <p className="muted">Сначала сохраните черновик. Публикация откроет продажи.</p>
        </div>
        <Link className="button secondary" to="/organizer">
          Назад
        </Link>
      </div>
      <Notice message={message} />
      <div className="event-library-callout">
        <div>
          <strong>У площадки уже может быть готовая схема</strong>
          <p className="small muted">Поищите её в библиотеке перед созданием своей.</p>
        </div>
        <button className="button secondary" onClick={() => setShowLibrary(!showLibrary)}>
          {showLibrary ? 'Скрыть библиотеку' : 'Выбрать площадку'}
        </button>
      </div>
      {showLibrary && (
        <HallLibrary
          onCopy={(hall) => {
            if (formRef.current) {
              const body = Object.fromEntries(new FormData(formRef.current).entries())
              setDetails({
                ...body,
                starts_at: `${body.starts_at}:00+03:00`,
                doors_at: `${body.doors_at}:00+03:00`,
                age_limit: Number(body.age_limit),
                timezone: 'Europe/Moscow',
                poster_url: body.poster_url || null,
              } as EventDetails)
            }
            setHalls((previous) => [hall, ...previous])
            setCopiedHall(hall)
            setShowLibrary(false)
          }}
        />
      )}

      {!halls.length ? (
        <div className="empty">
          <h2>Сначала создайте схему зала</h2>
          <p className="muted">Каждый концерт должен быть связан с вашей площадкой и ценами.</p>
          <Link className="button primary" to="/organizer/halls">
            Создать зал
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <form
          ref={formRef}
          key={copiedHall?.id || id || 'new'}
          className="event-form"
          onSubmit={submit}
        >
          <div className="panel form-panel">
            <h3>О концерте</h3>
            <label>
              Название
              <input
                name="title"
                required
                minLength={3}
                maxLength={180}
                defaultValue={details?.title}
                placeholder="Например, Ночь живой музыки"
              />
            </label>
            <label>
              Артист / состав
              <input
                name="artist"
                required
                minLength={2}
                maxLength={180}
                defaultValue={details?.artist}
              />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                required
                minLength={20}
                maxLength={10000}
                rows={5}
                defaultValue={details?.description}
                placeholder="Программа, участники и всё, что нужно знать зрителю"
              />
            </label>
            <label>
              Жанр
              <select name="genre" defaultValue={details?.genre || 'live'}>
                {Object.entries(genres).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ссылка на афишу
              <input
                name="poster_url"
                type="url"
                defaultValue={details?.poster_url || ''}
                placeholder="https://… (необязательно)"
              />
            </label>
            <div className="form-grid">
              <label>
                Начало (МСК, UTC+3)
                <input
                  name="starts_at"
                  type="datetime-local"
                  required
                  defaultValue={local(details?.starts_at)}
                />
              </label>
              <label>
                Открытие дверей (МСК)
                <input
                  name="doors_at"
                  type="datetime-local"
                  required
                  defaultValue={local(
                    details?.doors_at ||
                      new Date(Date.now() + 30 * 86400000 - 3600000).toISOString(),
                  )}
                />
              </label>
            </div>
            <label>
              Возрастное ограничение
              <select name="age_limit" defaultValue={details?.age_limit || 16}>
                {[0, 6, 12, 16, 18].map((a) => (
                  <option value={a} key={a}>
                    {a}+
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <div className="panel form-panel">
              <h3>Площадка и продажи</h3>
              <label>
                Схема зала
                <select
                  name="hall_id"
                  required
                  defaultValue={copiedHall?.id || details?.hall_id || halls[0].id}
                >
                  {halls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} · {h.layout.seats.length} мест
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Город
                <input
                  name="city"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={copiedHall?.venue_info?.city || details?.city}
                />
              </label>
              <label>
                Площадка
                <input
                  name="venue"
                  required
                  minLength={2}
                  maxLength={180}
                  defaultValue={copiedHall?.venue_info?.venue || details?.venue}
                />
              </label>
              <label>
                Адрес
                <input
                  name="address"
                  required
                  minLength={5}
                  maxLength={250}
                  defaultValue={copiedHall?.venue_info?.address || details?.address}
                />
              </label>
              <label>
                Организатор
                <input
                  name="organizer_name"
                  required
                  minLength={2}
                  maxLength={180}
                  defaultValue={details?.organizer_name || user?.name}
                />
              </label>
              <label>
                Контактный email
                <input
                  name="contact_email"
                  type="email"
                  required
                  defaultValue={details?.contact_email || user?.email}
                />
              </label>
              <label>
                Условия возврата
                <textarea
                  name="refund_policy"
                  required
                  minLength={20}
                  maxLength={3000}
                  rows={3}
                  defaultValue={details?.refund_policy}
                  placeholder="Укажите условия и способ обращения за возвратом"
                />
              </label>
              <p className="small muted">
                Цены берутся из схемы зала. После публикации схема, цены и условия фиксируются.
                Возвраты оплаченных билетов через кабинет пока не подключены.
              </p>
            </div>
            <button className="button primary full" disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить черновик'}
              <Check size={17} />
            </button>
          </div>
        </form>
      )}
    </>
  )
}
