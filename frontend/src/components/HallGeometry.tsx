import { useId, useMemo, type PointerEvent } from 'react'
import { appearanceOf, safeAnchor, resizeCursor, type ResizeHandle } from '../editorGeometry'
import { levelOf, type HallObject, type Layout, type Shape } from '../types'

/** Small, consistent plan symbols; actual saleable seats remain separate objects. */
export function ObjectSymbol({ kind }: { kind: HallObject['kind'] }) {
  const paths: Record<HallObject['kind'], string> = {
    stairs: 'M3 20h5v-5h5v-5h5V5h3 M4 5l15 15 M15 20h4v-4',
    bar: 'M5 3h14l-7 9z M12 12v8 M8 21h8',
    table: 'M5 9h14v5H5z M7 14v7 M17 14v7 M8 3v3 M16 3v3',
    entrance: 'M4 21V3h10v18 M11 12h10 M18 9l3 3-3 3 M2 21h15',
    exit: 'M4 21V3h10v18 M21 12H11 M14 9l-3 3 3 3 M2 21h15',
    sofa: 'M5 11V5h14v6 M3 10h4v7h10v-7h4v10H3z M5 20v2 M19 20v2',
    bench: 'M3 6h18v4H3z M4 14h16 M6 10v11 M18 10v11',
    wc: 'M8 6h8 M9 3h6 M8 9h8l-1 7H9z M10 16v5h4v-5',
    cloakroom: 'M12 7V5c0-3 4-3 4 0 M12 7L3 15v2h18v-2z',
    lift: 'M3 3h18v18H3z M7 8l3-3 3 3 M10 5v7 M11 16l3 3 3-3 M14 12v7',
    sound: 'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h8 M7 5v4 M16 9v4 M11 13v4',
    light: 'M7 3h10l3 7-8 5-8-5z M12 15v6 M8 21h8',
    fence: 'M3 5v15 M9 5v15 M15 5v15 M21 5v15 M3 8h18 M3 16h18',
    plant: 'M7 16h10l-2 6H9z M12 16V7 M12 11C2 11 3 1 12 7 M12 9c9 0 9-8 0-5',
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
  if (o.kind === 'entrance' || o.kind === 'exit')
    return (
      <g
        transform={o.kind === 'exit' ? `translate(${w} 0) scale(-1 1)` : undefined}
        stroke="#468d72"
        fill="none"
        strokeWidth={Math.max(2, Math.min(w, h) * 0.025)}
      >
        <path d={`M ${w * 0.62} ${h * 0.15} H ${w * 0.82} V ${h * 0.85} H ${w * 0.62}`} />
        <path
          d={`M ${w * 0.14} ${h * 0.72} H ${w * 0.58} M ${w * 0.45} ${h * 0.6} L ${w * 0.58} ${h * 0.72} L ${w * 0.45} ${h * 0.84}`}
        />
        {v === 'double' && (
          <path
            d={`M ${w * 0.14} ${h * 0.35} H ${w * 0.58} M ${w * 0.45} ${h * 0.23} L ${w * 0.58} ${h * 0.35} L ${w * 0.45} ${h * 0.47}`}
          />
        )}
      </g>
    )
  if (o.kind === 'sofa' || o.kind === 'bench')
    return (
      <g stroke="#8594ad" fill="#ffffff55" strokeWidth={1.6}>
        <rect x={w * 0.08} y={h * 0.12} width={w * 0.84} height={h * 0.2} rx={4} />
        <rect x={w * 0.1} y={h * 0.35} width={w * 0.8} height={h * 0.5} rx={5} />
        {Array.from({ length: o.kind === 'sofa' ? 3 : 4 }, (_, i) => (
          <line
            key={i}
            x1={w * (0.1 + ((i + 1) * 0.8) / (o.kind === 'sofa' ? 4 : 5))}
            x2={w * (0.1 + ((i + 1) * 0.8) / (o.kind === 'sofa' ? 4 : 5))}
            y1={h * 0.35}
            y2={h * 0.85}
          />
        ))}
        <rect x={w * 0.04} y={h * 0.35} width={w * 0.1} height={h * 0.55} rx={4} />
        <rect x={w * 0.86} y={h * 0.35} width={w * 0.1} height={h * 0.55} rx={4} />
      </g>
    )
  if (o.kind === 'fence')
    return (
      <g stroke="#8d98aa" strokeWidth={2}>
        <line x1={w * 0.04} x2={w * 0.96} y1={h * 0.3} y2={h * 0.3} />
        <line x1={w * 0.04} x2={w * 0.96} y1={h * 0.7} y2={h * 0.7} />
        {Array.from({ length: Math.min(30, Math.max(3, Math.round(w / 20))) }, (_, i) => {
          const x = w * 0.05 + (i * w * 0.9) / (Math.min(30, Math.max(3, Math.round(w / 20))) - 1)
          return <line key={i} x1={x} x2={x} y1={h * 0.1} y2={h * 0.9} />
        })}
      </g>
    )
  // A table is a clean surface. Technical hatching uses a uniform SVG pattern below.
  return null
}
const handlePositions: { id: ResizeHandle; x: number; y: number; name: string }[] = [
  { id: 'nw', x: 0, y: 0, name: 'верхний левый угол' },
  { id: 'n', x: 0.5, y: 0, name: 'верхний край' },
  { id: 'ne', x: 1, y: 0, name: 'верхний правый угол' },
  { id: 'e', x: 1, y: 0.5, name: 'правый край' },
  { id: 'se', x: 1, y: 1, name: 'нижний правый угол' },
  { id: 's', x: 0.5, y: 1, name: 'нижний край' },
  { id: 'sw', x: 0, y: 1, name: 'нижний левый угол' },
  { id: 'w', x: 0, y: 0.5, name: 'левый край' },
]
export function ShapeGlyph({
  shape: s,
  color = '#eaecf2',
  active = false,
  onPointerDown,
  onVertex,
  onResize,
  onDecoration,
  onAddVertex,
  onRemoveVertex,
}: {
  shape: Shape
  color?: string
  active?: boolean
  onPointerDown?: (e: PointerEvent<SVGGElement>) => void
  onVertex?: (e: PointerEvent<SVGCircleElement>, index: number) => void
  onResize?: (e: PointerEvent<SVGElement>, handle: ResizeHandle) => void
  onDecoration?: (e: PointerEvent<SVGGElement>, target: 'icon' | 'label') => void
  onAddVertex?: (index: number) => void
  onRemoveVertex?: (index: number) => void
}) {
  const clip = useId().replace(/:/g, ''),
    patternId = clip + 'pattern',
    object = 'kind' in s ? (s as HallObject) : null,
    style = appearanceOf(s)
  const decorated =
    !!object && object.kind !== 'zone' && object.kind !== 'decoration' && style.icon_visible
  const iconSize = Math.min(22, s.width * 0.24, s.height * 0.26),
    fontSize = Math.max(
      6,
      Math.min(style.label_size, (s.width * 0.8) / (Math.max(s.label.length, 1) * 0.6)),
    )
  const labelWidth = Math.min(s.width * 0.9, s.label.length * fontSize * 0.6 + 8),
    labelHeight = fontSize + 6
  const iconAnchor = useMemo(
    () => safeAnchor(s, style.icon_position, iconSize + 6, iconSize + 6),
    [s, iconSize, style.icon_position],
  )
  const labelAnchor = useMemo(
    () =>
      safeAnchor(
        s,
        style.label_position || { x: 0.5, y: decorated ? 0.7 : 0.5 },
        labelWidth,
        labelHeight,
      ),
    [s, style.label_position, decorated, labelWidth, labelHeight],
  )
  const pattern =
      style.pattern === 'auto'
        ? object?.kind === 'technical'
          ? 'diagonal'
          : 'none'
        : style.pattern,
    spacing = style.pattern_spacing
  return (
    <g
      transform={`translate(${s.x} ${s.y}) rotate(${s.rotation || 0} ${s.width / 2} ${s.height / 2})`}
      onPointerDown={onPointerDown}
      className={onPointerDown ? 'draggable' : undefined}
      data-object-kind={object?.kind}
      data-object-id={object?.id}
      data-stage={object ? undefined : 'true'}
      data-variant={object?.variant || 'plain'}
    >
      <title>{s.label}</title>
      <defs>
        <clipPath id={clip}>
          <Surface s={s} />
        </clipPath>
        <pattern
          id={patternId}
          width={spacing}
          height={spacing}
          patternUnits="userSpaceOnUse"
          patternTransform={
            pattern === 'diagonal' || pattern === 'cross'
              ? `rotate(${style.pattern_angle})`
              : undefined
          }
        >
          <g fill="none" stroke={style.pattern_color} strokeWidth={style.pattern_width}>
            {pattern === 'dots' ? (
              <circle
                cx={spacing / 2}
                cy={spacing / 2}
                r={style.pattern_width + 0.5}
                fill={style.pattern_color}
                stroke="none"
              />
            ) : pattern === 'horizontal' ? (
              <path d={`M 0 0 H ${spacing}`} />
            ) : (
              <>
                <path d={`M 0 0 V ${spacing}`} />
                {pattern === 'cross' && <path d={`M 0 0 H ${spacing}`} />}
              </>
            )}
          </g>
        </pattern>
      </defs>
      <g fill={color} stroke={style.outline_color} strokeWidth={style.outline_width}>
        <Surface s={s} />
      </g>
      <g clipPath={`url(#${clip})`} data-clipped-content="true">
        {object && style.details_visible && (
          <g pointerEvents="none" data-plan-detail="true">
            <PlanDetail o={object} />
          </g>
        )}
        {pattern !== 'none' && (
          <g fill={`url(#${patternId})`} stroke="none" pointerEvents="none" data-pattern={pattern}>
            <Surface s={s} />
          </g>
        )}
        {decorated && object && (
          <g
            data-decoration="icon"
            transform={`translate(${iconAnchor.x * s.width - iconSize / 2} ${iconAnchor.y * s.height - iconSize / 2})`}
            className={active && onDecoration ? 'decoration-handle' : undefined}
            color={style.label_color}
            onPointerDown={active && onDecoration ? (e) => onDecoration(e, 'icon') : undefined}
            pointerEvents={active && onDecoration ? 'all' : 'none'}
            role={active && onDecoration ? 'button' : undefined}
            aria-label={active && onDecoration ? 'Переместить значок' : undefined}
          >
            <rect x={-3} y={-3} width={iconSize + 6} height={iconSize + 6} rx={4} fill="white" />
            <g transform={`scale(${iconSize / 24})`}>
              <ObjectSymbol kind={object.kind} />
            </g>
            <title>Перетащите значок внутри объекта</title>
          </g>
        )}
        {s.label && style.label_visible && (
          <g
            data-decoration="label"
            transform={`translate(${labelAnchor.x * s.width} ${labelAnchor.y * s.height})`}
            className={active && onDecoration ? 'decoration-handle' : undefined}
            onPointerDown={active && onDecoration ? (e) => onDecoration(e, 'label') : undefined}
            pointerEvents={active && onDecoration ? 'all' : 'none'}
            role={active && onDecoration ? 'button' : undefined}
            aria-label={active && onDecoration ? 'Переместить подпись' : undefined}
          >
            <rect
              x={-labelWidth / 2}
              y={-labelHeight / 2}
              width={labelWidth}
              height={labelHeight}
              fill="white"
              rx={3}
            />
            <text
              y={fontSize * 0.34}
              textAnchor="middle"
              fill={style.label_color}
              fontSize={fontSize}
            >
              {s.label}
            </text>
            <title>Перетащите подпись внутри объекта</title>
          </g>
        )}
      </g>
      {active && onResize && (
        <g className="transform-frame">
          <rect
            x={-8}
            y={-8}
            width={s.width + 16}
            height={s.height + 16}
            fill="none"
            stroke="#7561ef"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
          {handlePositions.map((h) => {
            const x = h.x * s.width + (h.x === 0 ? -8 : h.x === 1 ? 8 : 0),
              y = h.y * s.height + (h.y === 0 ? -8 : h.y === 1 ? 8 : 0)
            return (
              <rect
                key={h.id}
                x={x - 5}
                y={y - 5}
                width={10}
                height={10}
                rx={2}
                fill="white"
                stroke="#7561ef"
                strokeWidth={1.5}
                className={`resize-${h.id}`}
                style={{ cursor: resizeCursor(h.id, s.rotation) }}
                role="button"
                aria-label={`Размер: ${h.name}`}
                onPointerDown={(e) => onResize(e, h.id)}
              >
                <title>Тяните для изменения размера. Shift — сохранить пропорции.</title>
              </rect>
            )
          })}
          {[
            { id: 'n' as const, d: `M 0 -8 H ${s.width}` },
            { id: 'e' as const, d: `M ${s.width + 8} 0 V ${s.height}` },
            { id: 's' as const, d: `M 0 ${s.height + 8} H ${s.width}` },
            { id: 'w' as const, d: `M -8 0 V ${s.height}` },
          ].map((h) => (
            <path
              key={h.id}
              d={h.d}
              stroke="transparent"
              strokeWidth={10}
              fill="none"
              className={`resize-${h.id}`}
              style={{ cursor: resizeCursor(h.id, s.rotation) }}
              onPointerDown={(e) => onResize(e, h.id)}
            />
          ))}
        </g>
      )}
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
            data-vertex={i}
            role="button"
            aria-label={`Узел ${i + 1}`}
            onPointerDown={(e) => onVertex(e, i)}
            onDoubleClick={(e) => {
              e.stopPropagation()
              onRemoveVertex?.(i)
            }}
          >
            <title>Перетаскивайте узел. Двойной клик — удалить.</title>
          </circle>
        ))}
      {active &&
        onAddVertex &&
        s.shape === 'polygon' &&
        s.points?.map((p, i) => {
          const q = s.points![(i + 1) % s.points!.length]
          return (
            <circle
              key={i}
              cx={((p.x + q.x) * s.width) / 2}
              cy={((p.y + q.y) * s.height) / 2}
              r={4}
              fill="#eee9fd"
              stroke="#7561ef"
              strokeDasharray="2 2"
              role="button"
              aria-label={`Добавить узел после ${i + 1}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onAddVertex(i)
              }}
            >
              <title>Нажмите, чтобы добавить узел на ребро</title>
            </circle>
          )
        })}
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
