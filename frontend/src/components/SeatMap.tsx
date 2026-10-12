import { useState } from 'react'
import { levelOf, levelsOf, rowMarkers, type Layout } from '../types'
import { HallGeometry } from './HallGeometry'

export function SeatMap({
  layout,
  states = {},
  selected = [],
  onSelect,
  showLevels = true,
}: {
  layout: Layout
  states?: Record<string, string>
  selected?: string[]
  onSelect?: (id: string) => void
  showLevels?: boolean
}) {
  const levels = levelsOf(layout)
  const [chosenLevel, setChosenLevel] = useState(levels[0].id)
  const level = levels.some((l) => l.id === chosenLevel) ? chosenLevel : levels[0].id
  const seats = layout.seats.filter((s) => levelOf(s) === level)
  return (
    <div className="seat-map-container">
      {showLevels && levels.length > 1 && (
        <div className="editor-level-tabs" aria-label="Уровни зала">
          {levels.map((l) => (
            <button
              key={l.id}
              className={l.id === level ? 'active' : ''}
              onClick={() => setChosenLevel(l.id)}
            >
              {l.name}
              {selected.some((id) => layout.seats.some((s) => s.id === id && levelOf(s) === l.id))
                ? ' •'
                : ''}
            </button>
          ))}
        </div>
      )}
      <svg
        className="seat-map"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label="Схема зала"
      >
        <HallGeometry layout={layout} level={level} />
        {seats.map((seat) => {
          const state = states[seat.id] || (seat.blocked ? 'blocked' : 'available')
          const available = state === 'available'
          const active = selected.includes(seat.id)
          const category = layout.categories.find((c) => c.id === seat.category_id)
          return (
            <g
              key={seat.id}
              role="button"
              aria-disabled={!available}
              aria-pressed={active}
              aria-label={`${level !== 'ground' ? `${levels.find((l) => l.id === level)?.name}, ` : ''}${seat.section}, ряд ${seat.row}, место ${seat.number}, ${category?.name}${seat.accessible ? ', доступное место' : ''}, ${available ? 'свободно' : 'занято'}`}
              tabIndex={available && onSelect ? 0 : -1}
              onClick={() => available && onSelect?.(seat.id)}
              onKeyDown={(e) => {
                if (['Enter', ' '].includes(e.key)) {
                  e.preventDefault()
                  if (available) onSelect?.(seat.id)
                }
              }}
              className={available && onSelect ? 'seat-interactive' : ''}
            >
              <title>{`${seat.section} · Ряд ${seat.row}, место ${seat.number} · ${category?.name}${seat.accessible ? ' · Доступное место' : ''}`}</title>
              <path
                d="M -7 7 Q 0 12 7 7"
                transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation || 0})`}
                fill="none"
                stroke={available ? category?.color : '#d8dbe3'}
                strokeWidth={3}
              />
              <circle
                cx={seat.x}
                cy={seat.y}
                r={active ? 12 : 10}
                fill={active ? '#252c40' : available ? category?.color : '#d8dbe3'}
                stroke={active ? '#fff' : 'none'}
                strokeWidth="3"
              />
              <text
                x={seat.x}
                y={seat.y + 3}
                fontSize="8"
                fill={available ? '#fff' : '#8a8e9c'}
                textAnchor="middle"
                pointerEvents="none"
              >
                {seat.accessible ? '♿' : seat.number}
              </text>
            </g>
          )
        })}
        {rowMarkers(seats).map((row) => {
          return (
            <text
              key={row.key}
              x={row.x - 25}
              y={row.y + 4}
              textAnchor="end"
              fontSize="12"
              fill="#8a8e9c"
            >
              {row.row}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
