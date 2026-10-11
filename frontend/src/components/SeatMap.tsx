import { rowMarkers, type Layout } from '../types'

export function SeatMap({
  layout,
  states = {},
  selected = [],
  onSelect,
}: {
  layout: Layout
  states?: Record<string, string>
  selected?: string[]
  onSelect?: (id: string) => void
}) {
  return (
    <svg
      className="seat-map"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="group"
      aria-label="Схема зала"
    >
      <rect
        x={layout.stage.x}
        y={layout.stage.y}
        width={layout.stage.width}
        height={layout.stage.height}
        rx="12"
        fill="#e9eaf0"
      />
      <text
        x={layout.stage.x + layout.stage.width / 2}
        y={layout.stage.y + layout.stage.height / 2 + 5}
        textAnchor="middle"
        fill="#6a7081"
        fontSize="16"
        letterSpacing="5"
      >
        {layout.stage.label}
      </text>
      {layout.seats.map((seat) => {
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
            aria-label={`${seat.section}, ряд ${seat.row}, место ${seat.number}, ${category?.name}${seat.accessible ? ', доступное место' : ''}, ${available ? 'свободно' : 'занято'}`}
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
      {rowMarkers(layout.seats).map((row) => {
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
  )
}
