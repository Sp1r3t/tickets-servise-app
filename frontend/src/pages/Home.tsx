import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Music2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useAuth } from '../api'
import { Loading, Notice } from '../components/ui'
import { errorText } from '../constants'
import { date, genres, money, type Concert } from '../types'

function Poster({ concert: c, index = 0 }: { concert: Concert; index?: number }) {
  return (
    <div className={`afisha-poster poster-${index % 4}`}>
      {c.details.poster_url ? (
        <img
          src={c.details.poster_url}
          alt={`Постер: ${c.details.title}`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <div className="poster-lettering" aria-hidden="true">
          <span>LIVE</span>
          <Music2 size={52} />
          <strong>{c.details.artist}</strong>
        </div>
      )}
      <span className="age-pill">{c.details.age_limit}+</span>
      <div className="poster-bottom">
        <span>{genres[c.details.genre || 'live']}</span>
        <span>↗</span>
      </div>
    </div>
  )
}

export function Home() {
  const { user } = useAuth()
  const [concerts, setConcerts] = useState<Concert[]>([]),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState('')
  const [search, setSearch] = useState(''),
    [city, setCity] = useState(''),
    [genre, setGenre] = useState(''),
    [when, setWhen] = useState(''),
    [price, setPrice] = useState(''),
    [sort, setSort] = useState('date'),
    [hasMore, setHasMore] = useState(false),
    [loadingMore, setLoadingMore] = useState(false)
  async function load(offset = 0) {
    try {
      const rows = await api<Concert[]>(`/events?limit=100&offset=${offset}`)
      setConcerts((previous) => (offset ? [...previous, ...rows] : rows))
      setHasMore(rows.length === 100)
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setReady(true)
      setLoadingMore(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const cities = [...new Set(concerts.map((c) => c.details.city))].sort()
  const visible = useMemo(() => {
    const now = Date.now(),
      today = new Date()
    today.setHours(0, 0, 0, 0)
    return concerts
      .filter((c) => {
        const d = c.details,
          start = new Date(d.starts_at).getTime(),
          text = `${d.title} ${d.artist} ${d.venue}`.toLocaleLowerCase('ru')
        return (
          start > now &&
          (!city || d.city === city) &&
          (!genre || (d.genre || 'live') === genre) &&
          (!search || text.includes(search.toLocaleLowerCase('ru'))) &&
          (!price || (c.min_price != null && c.min_price <= Number(price) * 100)) &&
          (!when ||
            (when === 'week'
              ? start < now + 7 * 86400000
              : start >= today.getTime() && start < today.getTime() + 86400000))
        )
      })
      .sort((a, b) =>
        sort === 'price'
          ? (a.min_price ?? Infinity) - (b.min_price ?? Infinity)
          : new Date(a.details.starts_at).getTime() - new Date(b.details.starts_at).getTime(),
      )
  }, [concerts, search, city, genre, when, price, sort])
  const featured = visible[0]
  const filtered = Boolean(search || city || genre || when || price)
  function reset() {
    setSearch('')
    setCity('')
    setGenre('')
    setWhen('')
    setPrice('')
  }
  return (
    <div className="afisha">
      <div className="afisha-heading">
        <div>
          <div className="eyebrow">МУЗЫКА. ЛЮДИ. МОМЕНТЫ.</div>
          <h1>
            Афиша<span className="heading-dot">.</span>
          </h1>
        </div>
        <label className="city-selector">
          <MapPin size={17} />
          <span className="sr-only">Город афиши</span>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Все города</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <section className="discovery-hero">
        <div className="discovery-copy">
          <div className="live-chip">
            <span /> ЖИВОЙ ЗВУК. НАСТОЯЩИЕ ЭМОЦИИ.
          </div>
          <h2>
            Быть там,
            <br />
            где <em>звучит жизнь.</em>
          </h2>
          <p>
            {user
              ? `${user.name}, найдите концерт, который станет вашей историей.`
              : 'Первый ряд или танцпол? Найдите свою музыку и выберите лучшие места.'}
          </p>
          <a className="button discovery-button" href="#concerts">
            Найти свой концерт
            <ArrowRight size={17} />
          </a>
        </div>
        <div className="discovery-art" aria-hidden="true">
          <div className="orbital orbital-one" />
          <div className="orbital orbital-two" />
          <div className="sound-wave">
            {Array.from({ length: 19 }, (_, i) => (
              <i key={i} style={{ height: `${26 + ((i * 43 + 19) % 125)}px` }} />
            ))}
          </div>
          <div className="floating-ticket">
            <Ticket size={25} />
            <div>
              <strong>Ваш вечер начинается здесь</strong>
              <span>Выбирайте места на схеме зала</span>
            </div>
            <Sparkles size={19} />
          </div>
          <span className="hero-art-label">FEEL THE MUSIC / TICKETFLOW</span>
        </div>
      </section>
      <div className="genre-tabs" aria-label="Жанры">
        <button className={!genre ? 'active' : ''} onClick={() => setGenre('')}>
          Все концерты
        </button>
        {Object.entries(genres)
          .filter(([key]) => key !== 'other')
          .map(([key, name]) => (
            <button
              key={key}
              className={genre === key ? 'active' : ''}
              onClick={() => setGenre(key)}
            >
              {name}
            </button>
          ))}
      </div>
      <div id="concerts" className="afisha-tools">
        <label className="afisha-search">
          <Search size={19} />
          <span className="sr-only">Поиск концертов</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Артист, концерт или площадка"
          />
          {search && (
            <button
              className="icon-button"
              aria-label="Очистить поиск"
              onClick={() => setSearch('')}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <label className="filter-control">
          <CalendarDays size={16} />
          <span className="sr-only">Дата концерта</span>
          <select value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="">Любая дата</option>
            <option value="today">Сегодня</option>
            <option value="week">Ближайшие 7 дней</option>
          </select>
        </label>
        <label className="filter-control">
          <SlidersHorizontal size={16} />
          <span className="sr-only">Цена билета</span>
          <select value={price} onChange={(e) => setPrice(e.target.value)}>
            <option value="">Любая цена</option>
            <option value="2000">До 2 000 ₽</option>
            <option value="5000">До 5 000 ₽</option>
            <option value="10000">До 10 000 ₽</option>
          </select>
        </label>
      </div>
      <Notice message={message} />
      {featured && !filtered && (
        <Link to={`/widget/${featured.slug}`} className="featured-concert">
          <div className="featured-icon">
            <Music2 size={27} />
          </div>
          <div>
            <span className="eyebrow">БЛИЖАЙШИЙ КОНЦЕРТ</span>
            <h3>{featured.details.title}</h3>
            <p>
              {date(featured.details.starts_at, featured.details.timezone)} ·{' '}
              {featured.details.venue}
            </p>
          </div>
          <span className="featured-price">
            {featured.min_price != null ? `от ${money(featured.min_price)}` : 'Выбрать места'}
            <ArrowRight size={20} />
          </span>
        </Link>
      )}
      <div className="section-heading">
        <div>
          <div className="eyebrow">ВАШ СЛЕДУЮЩИЙ ВЕЧЕР</div>
          <h2>
            {filtered ? 'Подобрали для вас' : 'На сцене скоро'}{' '}
            <span className="count-badge">{visible.length}</span>
          </h2>
        </div>
        <label className="afisha-sort">
          <span className="sr-only">Сортировка концертов</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date">Сначала ближайшие</option>
            <option value="price">Сначала дешевле</option>
          </select>
        </label>
      </div>
      {!ready ? (
        <Loading />
      ) : visible.length ? (
        <div className="afisha-grid">
          {visible.map((c, i) => (
            <Link key={c.id} className="afisha-card" to={`/widget/${c.slug}`}>
              <Poster concert={c} index={i} />
              <div className="afisha-card-info">
                <div className="card-date">{date(c.details.starts_at, c.details.timezone)}</div>
                <h3>{c.details.title}</h3>
                <p>
                  <MapPin size={13} />
                  {c.details.city} · {c.details.venue}
                </p>
                <div className="card-sale">
                  <strong>{c.min_price != null ? `от ${money(c.min_price)}` : 'Билеты'}</strong>
                  <span>
                    Выбрать места
                    <ArrowRight size={15} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Search size={32} />
          <h3>{filtered ? 'Пока ничего не нашлось' : 'Новые концерты уже на подходе'}</h3>
          <p className="muted">
            {filtered
              ? 'Попробуйте другой запрос или снимите фильтры.'
              : 'Опубликованные концерты появятся здесь, когда откроются продажи.'}
          </p>
          {filtered && (
            <button className="button secondary" onClick={reset}>
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      {hasMore && (
        <button
          className="button secondary full"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true)
            void load(concerts.length)
          }}
        >
          {loadingMore ? 'Загрузка…' : 'Загрузить ещё концерты'}
        </button>
      )}
      <div className="afisha-benefits">
        <div>
          <Ticket size={22} />
          <strong>Место выбираете вы</strong>
          <p>Схема зала, категории и цены до покупки.</p>
        </div>
        <div>
          <CalendarDays size={22} />
          <strong>10 минут на решение</strong>
          <p>Выбранные места сохраняются на время брони.</p>
        </div>
        <div>
          <Sparkles size={22} />
          <strong>Все билеты под рукой</strong>
          <p>Электронный билет с QR в вашем кабинете.</p>
        </div>
      </div>
      {user?.role === 'organizer' && (
        <Link className="button secondary" to="/organizer">
          Перейти в кабинет организатора
          <ArrowRight size={16} />
        </Link>
      )}
      <footer className="afisha-footer">
        <strong>ticketflow.</strong>
        <span>Больше музыки. Больше воспоминаний.</span>
        <Link to="/account">Мои билеты</Link>
      </footer>
    </div>
  )
}
