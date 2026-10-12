import { useId, type PointerEvent } from 'react'
import { levelOf, type HallObject, type Layout, type Shape } from '../types'

/** Small, consistent plan symbols; actual saleable seats remain separate objects. */
export function ObjectSymbol({ kind }: { kind: HallObject['kind'] }) {
  const paths: Record<HallObject['kind'], string> = {
    stairs: 'M3 20h5v-5h5v-5h5V5h3 M4 5l15 15 M15 20h4v-4',
    bar: 'M5 3h14l-7 9z M12 12v8 M8 21h8',
    table: 'M5 9h14v5H5z M7 14v7 M17 14v7 M8 3v3 M16 3v3',
    entrance: 'M5 21V3h12v18 M2 21h20 M12 12h8 M17 9l3 3-3 3',
    column: 'M7 4h10 M8 5v14 M16 5v14 M7 20h10 M11 5v14 M13 5v14',
    technical: 'M4 6h16v12H4z M8 10v4 M12 8v8 M16 10v4',
    decoration: 'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z',
    zone: 'M3 4h18v16H3z M7 8h10 M7 12h6 M7 16h10',
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  )
}
function Surface({ s }: { s: Shape }) {
  return s.shape === 'polygon' ? (
    <polygon points={s.points?.map((p) => `${p.x * s.width},${p.y * s.height}`).join(' ')} />
  ) : s.shape === 'ellipse' ? (
    <ellipse cx={s.width / 2} cy={s.height / 2} rx={s.width / 2} ry={s.height / 2} />
  ) : (
    <rect width={s.width} height={s.height} rx={5} />
  )
}
function PlanDetail({ o }: { o: HallObject }) {
  const w = o.width,
    h = o.height,
    v = o.variant || 'straight'
  if (o.kind === 'stairs') {
    if (v === 'spiral')
      return (
        <g stroke="#7e879b" fill="none" strokeWidth={1.5}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6
            return (
              <line
                key={i}
                x1={w / 2}
                y1={h / 2}
                x2={w / 2 + Math.cos(a) * w * 0.46}
                y2={h / 2 + Math.sin(a) * h * 0.46}
              />
            )
          })}
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.08} fill="#9ca6b7" />
        </g>
      )
    return (
      <g stroke="#8893a7" fill="none" strokeWidth={1.4}>
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            {v === 'corner' ? (
              <>
                <line x1={w * 0.03} x2={w * 0.37} y1={((i + 1) * h) / 12} y2={((i + 1) * h) / 12} />
                <line
                  x1={w * 0.4 + (i + 1) * w * 0.055}
                  x2={w * 0.4 + (i + 1) * w * 0.055}
                  y1={h * 0.03}
                  y2={h * 0.37}
                />
              </>
            ) : (
              <line x1={w * 0.06} x2={w * 0.94} y1={((i + 1) * h) / 12} y2={((i + 1) * h) / 12} />
            )}
          </g>
        ))}
        {v === 'double' && (
          <rect x={w * 0.46} y={h * 0.03} width={w * 0.08} height={h * 0.94} fill="#f2f4f8" />
        )}
      </g>
    )
  }
  if (o.kind === 'bar')
    return (
      <g stroke="#897296" fill="none" strokeWidth={Math.max(3, Math.min(w, h) * 0.09)}>
        {v === 'island' ? (
          <ellipse cx={w / 2} cy={h / 2} rx={w * 0.38} ry={h * 0.33} />
        ) : (
          <path
            d={
              v === 'corner'
                ? `M ${w * 0.1} ${h * 0.94} V ${h * 0.15} H ${w * 0.94}`
                : v === 'double'
                  ? `M ${w * 0.15} ${h * 0.94} V ${h * 0.15} H ${w * 0.85} V ${h * 0.94}`
                  : w < h
                    ? `M ${w * 0.18} ${h * 0.07} V ${h * 0.93}`
                    : `M ${w * 0.07} ${h * 0.18} H ${w * 0.93}`
            }
          />
        )}
      </g>
    )
  if (o.kind === 'entrance')
    return (
      <g stroke="#71958a" fill="none" strokeWidth={2}>
        <path
          d={`M ${w * 0.15} ${h * 0.85} V ${h * 0.15} Q ${w * 0.75} ${h * 0.15} ${w * 0.75} ${h * 0.85}`}
          strokeDasharray="4 3"
        />
        <path d={`M ${w * 0.15} ${h * 0.85} L ${w * 0.65} ${h * 0.3}`} />
        {v === 'double' && <path d={`M ${w * 0.85} ${h * 0.85} L ${w * 0.35} ${h * 0.3}`} />}
      </g>
    )
  if (o.kind === 'table')
    return (
      <g stroke="#b7a690" fill="none" strokeWidth={1.4}>
        {Array.from({ length: 3 }, (_, i) => (
          <line
            key={i}
            x1={w * 0.12}
            x2={w * 0.88}
            y1={h * (0.3 + i * 0.2)}
            y2={h * (0.3 + i * 0.2)}
          />
        ))}
      </g>
    )
  if (o.kind === 'technical')
    return (
      <g stroke="#8e98a9" strokeWidth={1}>
        {Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1={(i * w) / 8 - h} y1={h} x2={(i * w) / 8} y2={0} />
        ))}
      </g>
    )
  return null
}
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
  const clip = useId().replace(/:/g, '')
  const object = 'kind' in s ? (s as HallObject) : null
  const decorated = object && object.kind !== 'zone' && object.kind !== 'decoration'
  const iconSize = Math.min(22, s.width * 0.24, s.height * 0.26)
  return (
    <g
      transform={`translate(${s.x} ${s.y}) rotate(${s.rotation || 0} ${s.width / 2} ${s.height / 2})`}
      onPointerDown={onPointerDown}
      className={onPointerDown ? 'draggable' : undefined}
      data-object-kind={object?.kind}
      data-variant={object?.variant || 'plain'}
    >
      <defs>
        <clipPath id={clip}>
          <Surface s={s} />
        </clipPath>
      </defs>
      <g fill={color} stroke={active ? '#7561ef' : '#bac3d4'} strokeWidth={active ? 3 : 1}>
        <Surface s={s} />
      </g>
      {object && (
        <g clipPath={`url(#${clip})`} pointerEvents="none">
          <PlanDetail o={object} />
        </g>
      )}
      {decorated && (
        <g
          transform={`translate(${s.width / 2 - iconSize / 2} ${s.height / 2 - iconSize * 0.85}) scale(${iconSize / 24})`}
          color="#536077"
          pointerEvents="none"
        >
          <rect x={-3} y={-3} width={30} height={30} rx={7} fill={color} fillOpacity={0.95} />
          <ObjectSymbol kind={object.kind} />
        </g>
      )}
      <text
        x={s.width / 2}
        y={s.height / 2 + (decorated ? iconSize * 0.9 : 4)}
        textAnchor="middle"
        fill="#566074"
        fontSize={Math.min(decorated ? 11 : 14, (s.width / Math.max(s.label.length, 1)) * 1.4)}
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
export function GhostLevels({ layout, level }: { layout: Layout; level: string }) {
  return (
    <g data-level-ghost="true" opacity={0.17} pointerEvents="none" aria-hidden="true">
      {(layout.objects || [])
        .filter((o) => levelOf(o) !== level)
        .map((o) => (
          <ShapeGlyph key={o.id} shape={o} color={o.color} />
        ))}
      {layout.seats
        .filter((s) => levelOf(s) !== level)
        .map((s) => (
          <g key={s.id}>
            <path
              d="M -7 7 Q 0 12 7 7"
              transform={`translate(${s.x} ${s.y}) rotate(${s.rotation || 0})`}
              fill="none"
              stroke="#8e98ac"
              strokeWidth={2}
            />
            <circle cx={s.x} cy={s.y} r={10} fill="#9ba4b8" />
          </g>
        ))}
    </g>
  )
}
export function HallGeometry({ layout, level }: { layout: Layout; level: string }) {
  return (
    <>
      <GhostLevels layout={layout} level={level} />
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
