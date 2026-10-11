import {
  Armchair,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Music2,
  ShieldCheck,
  Ticket,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useAuth } from '../api'
import { Notice } from '../components/ui'
import { errorText } from '../constants'
import { date, type Concert } from '../types'

export function Home() {
  const [concerts, setConcerts] = useState<Concert[]>([]),
    [message, setMessage] = useState('')
  const { user } = useAuth()
  useEffect(() => {
    api<Concert[]>('/events')
      .then(setConcerts)
      .catch((e) => setMessage(errorText(e)))
  }, [])
  return (
    <div className="home">
      <section className="hero">
        <div>
          <div className="eyebrow">ПЛАТФОРМА ДЛЯ ЖИВОЙ МУЗЫКИ</div>
          <h1>
            Ваш концерт.
            <br />
            Ваш зал.
            <br />
            <span>Ваши зрители.</span>
          </h1>
          <p>
            От схемы зала до билета в руках зрителя.
            <br />
            Создавайте, бронируйте и продавайте в одном сервисе.
          </p>
          <Link
            className="button primary"
            to={user?.role === 'organizer' ? '/organizer' : '/login?mode=register&role=organizer'}
          >
            Начать продажи
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art">
          <div className="live-label">
            <span />
            ГОТОВЫ К АНШЛАГУ
          </div>
          <div className="hero-stage">СЦЕНА</div>
          <div className="hero-seats">
            {Array.from({ length: 56 }, (_, i) => (
              <i key={i} className={i % 7 === 0 ? 'gold' : i % 11 === 0 ? 'sold' : ''} />
            ))}
          </div>
          <div className="hero-ticket">
            <Ticket size={30} />
            <div>
              <strong>Место для ваших идей</strong>
              <span>Концерт начинается здесь</span>
            </div>
            <CheckCircle2 size={20} />
          </div>
        </div>
      </section>
      <section className="features">
        {[
          [Armchair, 'Зал по вашим правилам', 'Ряды, секторы, категории цен и доступные места.'],
          [ExternalLink, 'Продажи где угодно', 'Ссылка на концерт и виджет для вашего сайта.'],
          [
            ShieldCheck,
            'Каждое место под контролем',
            'Ограниченная бронь и проверка билета на входе.',
          ],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Armchair
          return (
            <div key={String(title)}>
              <I size={24} />
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </div>
          )
        })}
      </section>
      <div className="section-heading">
        <div>
          <div className="eyebrow">ОТКРЫТЫЕ ПРОДАЖИ</div>
          <h2>Выберите свой концерт</h2>
        </div>
        <span className="muted small">Билеты напрямую от организаторов</span>
      </div>
      <Notice message={message} />
      {concerts.length ? (
        <div className="concert-grid">
          {concerts.map((c) => (
            <Link to={`/widget/${c.slug}`} className="concert-card" key={c.id}>
              <div
                className="concert-cover"
                style={
                  c.details.poster_url
                    ? { backgroundImage: `url("${c.details.poster_url}")` }
                    : undefined
                }
              >
                <Music2 size={48} />
                <span>{c.details.age_limit}+</span>
              </div>
              <div className="concert-card-content">
                <div className="small muted">{date(c.details.starts_at, c.details.timezone)}</div>
                <h3>{c.details.title}</h3>
                <p className="muted small">
                  {c.details.city} · {c.details.venue}
                </p>
                <span className="text-button">
                  Выбрать места
                  <ChevronRight size={16} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Ticket size={32} />
          <h3>Продажи скоро откроются</h3>
          <p className="muted">Опубликуйте первый концерт из кабинета организатора.</p>
        </div>
      )}
    </div>
  )
}
