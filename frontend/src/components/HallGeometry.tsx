import type { PointerEvent } from 'react'
import { levelOf, type Layout, type Shape } from '../types'

export function ShapeGlyph({
  shape: s,
  color = '#eaecf2',
  active = false,
  onPointerDown,
  onVertex,
}: {
  shape: Shape
  color?: string
  active?: boolean
  onPointerDown?: (e: PointerEvent<SVGGElement>) => void
  onVertex?: (e: PointerEvent<SVGCircleElement>, index: number) => void
}) {
  return (
    <g
      transform={`translate(${s.x} ${s.y}) rotate(${s.rotation || 0} ${s.width / 2} ${s.height / 2})`}
      onPointerDown={onPointerDown}
      className={onPointerDown ? 'draggable' : undefined}
    >
      <g fill={color} stroke={active ? '#7561ef' : '#bac3d4'} strokeWidth={active ? 3 : 1}>
        {s.shape === 'polygon' ? (
          <polygon points={s.points?.map((p) => `${p.x * s.width},${p.y * s.height}`).join(' ')} />
        ) : s.shape === 'ellipse' ? (
          <ellipse cx={s.width / 2} cy={s.height / 2} rx={s.width / 2} ry={s.height / 2} />
        ) : (
          <rect width={s.width} height={s.height} rx={8} />
        )}
      </g>
      <text
        x={s.width / 2}
        y={s.height / 2 + 4}
        textAnchor="middle"
        fill="#566074"
        fontSize={Math.min(14, (s.width / Math.max(s.label.length, 1)) * 1.4)}
        pointerEvents="none"
      >
        {s.label}
      </text>
      {active &&
        onVertex &&
        s.shape === 'polygon' &&
        s.points?.map((p, i) => (
          <circle
            key={i}
            cx={p.x * s.width}
            cy={p.y * s.height}
            r={6}
            fill="white"
            stroke="#7561ef"
            strokeWidth={2}
            onPointerDown={(e) => onVertex(e, i)}
          />
        ))}
    </g>
  )
}

export function HallGeometry({ layout, level }: { layout: Layout; level: string }) {
  return (
    <>
      {(layout.objects || [])
        .filter((o) => levelOf(o) === level && o.kind === 'zone')
        .map((o) => (
          <ShapeGlyph key={o.id} shape={o} color={o.color} />
        ))}
      <g opacity={levelOf(layout.stage) === level ? 1 : 0.25}>
        <ShapeGlyph shape={layout.stage} />
      </g>
      {(layout.objects || [])
        .filter((o) => levelOf(o) === level && o.kind !== 'zone')
        .map((o) => (
          <ShapeGlyph key={o.id} shape={o} color={o.color} />
        ))}
    </>
  )
}
