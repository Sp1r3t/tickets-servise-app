import { Armchair, ArrowRight, Layers, MapPin, Search, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, post } from '../api'
import { errorText } from '../constants'
import type { CommunityVenue, Hall, Layout, LibraryPage } from '../types'
import { SeatMap } from './SeatMap'
import { Loading, Notice } from './ui'

export function HallLibrary({
  onCopy,
  onCreate,
}: {
  onCopy: (hall: Hall) => void
  onCreate?: () => void
}) {
  const [search, setSearch] = useState(''),
    [venues, setVenues] = useState<CommunityVenue[]>([]),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [hasMore, setHasMore] = useState(false),
    [offset, setOffset] = useState(0)
  const [venueKey, setVenueKey] = useState(''),
    [templateId, setTemplateId] = useState(''),
    [preview, setPreview] = useState<{ id: string; layout: Layout } | null>(null)
  useEffect(() => {
    let active = true
    setReady(false)
    setMessage('')
    setPreview(null)
    setTemplateId('')
    setVenueKey('')
    const timer = setTimeout(() => {
      api<LibraryPage>(
        `/organizer/library?search=${encodeURIComponent(search)}&limit=50&offset=${offset}`,
      )
        .then((data) => {
          if (active) {
            setVenues(data.venues)
            setHasMore(data.has_more)
            setVenueKey(data.venues[0]?.venue_key || '')
            setTemplateId(data.venues[0]?.templates[0]?.id || '')
          }
        })
        .catch((e) => {
          if (active) setMessage(errorText(e))
        })
        .finally(() => {
          if (active) setReady(true)
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search, offset])
  useEffect(() => {
    setPreview(null)
    if (!templateId) return
    let active = true
    api<{ id: string; layout: Layout }>(`/organizer/library/${templateId}`)
      .then((data) => {
        if (active) setPreview(data)
      })
      .catch((e) => {
        if (active) setMessage(errorText(e))
      })
    return () => {
      active = false
    }
  }, [templateId])
  const venue = venues.find((v) => v.venue_key === venueKey)
  const template = venue?.templates.find((t) => t.id === templateId)
  async function copy() {
    setBusy(true)
    setMessage('')
    try {
      onCopy(await post<Hall>(`/organizer/library/${templateId}/copy`))
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="community-library">
      <div className="library-intro">
        <div className="library-icon">
          <Users size={23} />
        </div>
        <div>
          <h3>Залы, созданные сообществом</h3>
          <p>Найдите площадку, сравните схемы и возьмите подходящую за основу.</p>
        </div>
      </div>
      <label className="afisha-search">
        <Search size={18} />
        <span className="sr-only">Поиск площадки</span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setOffset(0)
          }}
          placeholder="Название площадки, город или адрес"
        />
      </label>
      <Notice message={message} />
      {!ready ? (
        <Loading />
      ) : venues.length ? (
        <div className="library-grid">
          <div className="venue-list">
            {venues.map((v) => (
              <button
                key={v.venue_key}
                className={`venue-choice ${v.venue_key === venueKey ? 'active' : ''}`}
                onClick={() => {
                  setVenueKey(v.venue_key)
                  setTemplateId(v.templates[0].id)
                }}
              >
                <strong>{v.venue}</strong>
                <span>
                  <MapPin size={13} />
                  {v.city}
                </span>
                <small>{v.address}</small>
                <span className="badge">{v.templates.length} вариантов на странице</span>
              </button>
            ))}
          </div>
          <div className="library-detail">
            {venue && (
              <>
                <label>
                  Вариант схемы
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {venue.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.seat_count} мест · {t.author}
                      </option>
                    ))}
                  </select>
                </label>
                {template && (
                  <div className="template-meta">
                    <span>
                      <Armchair size={15} />
                      {template.seat_count} мест
                    </span>
                    <span>
                      <Layers size={15} />
                      {template.level_count} уровней
                    </span>
                    <span>Автор: {template.author}</span>
                  </div>
                )}
                <div className="library-preview">
                  {preview?.id === templateId ? <SeatMap layout={preview.layout} /> : <Loading />}
                </div>
                <p className="small muted">
                  Сохранится ваша отдельная копия. Проверьте расположение мест и назначьте цены для
                  своего концерта.
                </p>
                <button
                  className="button primary"
                  disabled={busy || !preview || preview.id !== templateId}
                  onClick={() => void copy()}
                >
                  {busy ? 'Копирование…' : 'Использовать эту схему'}
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="empty">
          <Search size={30} />
          <h3>Схема площадки пока не найдена</h3>
          <p className="muted">
            Создайте её в редакторе. После публикации концерта она станет доступна другим
            организаторам.
          </p>
          {onCreate ? (
            <button className="button primary" onClick={onCreate}>
              Создать свою схему
            </button>
          ) : (
            <Link className="button primary" to="/organizer/halls">
              Создать свою схему
            </Link>
          )}
        </div>
      )}
      {(offset > 0 || hasMore) && (
        <div className="library-pagination">
          <button
            className="button secondary"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Назад
          </button>
          <span>Страница {offset / 50 + 1}</span>
          <button
            className="button secondary"
            disabled={!hasMore}
            onClick={() => setOffset(offset + 50)}
          >
            Дальше
          </button>
        </div>
      )}
    </section>
  )
}
