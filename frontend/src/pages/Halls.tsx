import { Armchair, ArrowRight, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { HallEditor } from '../components/HallEditor'
import { SeatMap } from '../components/SeatMap'
import { Loading, Notice } from '../components/ui'
import { errorText } from '../constants'
import { type Hall } from '../types'

export function Halls() {
  const [halls, setHalls] = useState<Hall[]>([]),
    [editing, setEditing] = useState<Hall | 'new' | null>(null),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false)
  function reload() {
    api<Hall[]>('/halls')
      .then(setHalls)
      .catch((e) => setMessage(errorText(e)))
      .finally(() => setReady(true))
  }
  useEffect(reload, [])
  if (editing)
    return (
      <HallEditor
        key={editing === 'new' ? 'new' : editing.id}
        hall={editing === 'new' ? undefined : editing}
        onClose={() => {
          setEditing(null)
          reload()
        }}
        onSaved={(h) => setHalls((previous) => [h, ...previous.filter((x) => x.id !== h.id)])}
      />
    )
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">СХЕМЫ ПЛОЩАДОК</div>
          <h1>Залы и схемы</h1>
          <p className="muted">Создайте один раз — используйте для любого концерта.</p>
        </div>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={17} />
          Создать зал
        </button>
      </div>
      <Notice message={message} />
      {!ready ? (
        <Loading />
      ) : halls.length ? (
        <div className="hall-grid">
          {halls.map((h) => (
            <button className="hall-card" key={h.id} onClick={() => setEditing(h)}>
              <div className="hall-preview">
                <SeatMap layout={h.layout} />
              </div>
              <div className="hall-card-info">
                <strong>{h.name}</strong>
                <span className="small muted">
                  {h.layout.seats.length} мест · Версия {h.revision}
                </span>
                <span className="text-button small">
                  Открыть редактор
                  <ArrowRight size={15} />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Armchair size={35} />
          <h2>Здесь будет ваша первая схема</h2>
          <p className="muted">Добавьте сцену, ряды и ценовые категории в визуальном редакторе.</p>
          <button className="button primary" onClick={() => setEditing('new')}>
            Открыть редактор
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  )
}
