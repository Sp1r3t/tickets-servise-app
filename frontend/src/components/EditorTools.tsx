import { useState, type ReactNode } from 'react'
import { Layers, Plus, Copy, Trash2, MousePointer2 } from 'lucide-react'
import { levelOf, levelsOf, newId, type HallObject, type Layout, type Shape } from '../types'
import { objectNames, shapePresets, variants, withForm, withVariant } from '../editorShapes'
import { appearanceOf } from '../editorGeometry'
import { ObjectSymbol, ShapeGlyph } from './HallGeometry'

export function ToolSection({
  title,
  children,
  open = false,
}: {
  title: string
  children: ReactNode
  open?: boolean
}) {
  return (
    <details className="tool-section" open={open || undefined}>
      <summary>{title}</summary>
      <div className="tool-section-content">{children}</div>
    </details>
  )
}
export function transformRows(
  layout: Layout,
  selected: string[],
  bend: number,
  degrees: number,
): Layout {
  const keys = new Set(
    layout.seats
      .filter((s) => selected.includes(s.id))
      .map((s) => `${levelOf(s)}|${s.section}|${s.row}`),
  )
  const changed = new Map<string, Layout['seats'][number]>()
  for (const key of keys) {
    const row = layout.seats
      .filter((s) => `${levelOf(s)}|${s.section}|${s.row}` === key)
      .sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))
    if (!row.length) continue
    const first = row[0],
      last = row[row.length - 1]
    const cx = (first.x + last.x) / 2,
      cy = (first.y + last.y) / 2
    const length = Math.hypot(last.x - first.x, last.y - first.y)
    const angle = Math.atan2(last.y - first.y, last.x - first.x) + (degrees * Math.PI) / 180
    row.forEach((s, i) => {
      const t = row.length > 1 ? i / (row.length - 1) : 0.5
      const x = (t - 0.5) * length,
        y = bend * (1 - (2 * t - 1) ** 2)
      changed.set(s.id, {
        ...s,
        x: cx + x * Math.cos(angle) - y * Math.sin(angle),
        y: cy + x * Math.sin(angle) + y * Math.cos(angle),
        rotation:
          (((angle + Math.atan2(-4 * bend * (2 * t - 1), length || 1)) * 180) / Math.PI) % 360,
      })
    })
  }
  return { ...layout, seats: layout.seats.map((s) => changed.get(s.id) || s) }
}

export function LevelTools({
  layout,
  change,
  level,
  setLevel,
}: {
  layout: Layout
  change: (l: Layout) => void
  level: string
  setLevel: (id: string) => void
}) {
  const levels = levelsOf(layout),
    current = levels.find((l) => l.id === level) || levels[0]
  return (
    <>
      <h3>
        <Layers size={16} /> Уровни зала
      </h3>
      <div className="level-list">
        {levels.map((l) => (
          <button
            key={l.id}
            className={current.id === l.id ? 'active' : ''}
            onClick={() => setLevel(l.id)}
          >
            <Layers size={16} />
            <span>{l.name}</span>
            <small>{layout.seats.filter((s) => levelOf(s) === l.id).length}</small>
          </button>
        ))}
      </div>
      <label>
        Название уровня
        <input
          value={current.name}
          maxLength={80}
          onChange={(e) =>
            change({
              ...layout,
              levels: levels.map((l) => (l.id === current.id ? { ...l, name: e.target.value } : l)),
            })
          }
        />
      </label>
      <button
        className="button secondary full"
        disabled={levels.length >= 12}
        onClick={() => {
          const id = newId()
          change({ ...layout, levels: [...levels, { id, name: `Балкон ${levels.length}` }] })
          setLevel(id)
        }}
      >
        <Plus size={15} />
        Добавить балкон / ярус
      </button>
      {levels.length > 1 && current.id !== levelOf(layout.stage) && (
        <button
          className="text-button danger-text"
          disabled={
            layout.seats.some((s) => levelOf(s) === current.id) ||
            layout.objects?.some((o) => levelOf(o) === current.id)
          }
          onClick={() => {
            change({ ...layout, levels: levels.filter((l) => l.id !== current.id) })
            setLevel(levels[0].id)
          }}
        >
          Удалить пустой уровень
        </button>
      )}
      <p className="tool-hint">
        Соседние этажи видны бледным цветом. Редактируется только выбранный уровень.
      </p>
    </>
  )
}
export function rowBend(seats: Layout['seats']): number {
  if (seats.length < 3) return 0
  const row = [...seats].sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true })),
    first = row[0],
    last = row[row.length - 1],
    middle = row[Math.floor(row.length / 2)],
    a = Math.atan2(last.y - first.y, last.x - first.x),
    t = Math.floor(row.length / 2) / (row.length - 1)
  return (
    ((middle.y - (first.y + last.y) / 2) * Math.cos(a) -
      (middle.x - (first.x + last.x) / 2) * Math.sin(a)) /
    (1 - (2 * t - 1) ** 2)
  )
}
export function RowTools({
  layout,
  change,
  selected,
  preview,
  commit,
}: {
  layout: Layout
  change: (l: Layout) => void
  selected: string[]
  preview: (l: Layout) => void
  commit: () => void
}) {
  const first = layout.seats.find((s) => selected.includes(s.id))
  const row = first
    ? layout.seats.filter(
        (s) => levelOf(s) === levelOf(first) && s.section === first.section && s.row === first.row,
      )
    : []
  const bend = Math.round(rowBend(row))
  const [rotation, setRotation] = useState(0)
  return (
    <ToolSection title="Изгиб и направление" open>
      <div className="bend-preview">
        <svg viewBox="0 0 180 55" aria-hidden="true">
          <path
            d={`M 12 20 Q 90 ${20 + bend / 5} 168 20`}
            fill="none"
            stroke="#7561ef"
            strokeWidth="3"
          />
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8
            return (
              <circle
                key={i}
                cx={12 + t * 156}
                cy={20 + (bend / 10) * (1 - (2 * t - 1) ** 2)}
                r={4}
                fill="#7561ef"
              />
            )
          })}
        </svg>
        <span>{bend === 0 ? 'Прямой ряд' : bend > 0 ? 'Дуга от сцены' : 'Дуга к сцене'}</span>
      </div>
      <label>
        Изгиб ряда
        <input
          type="range"
          aria-label="Изгиб ряда"
          min={-180}
          max={180}
          value={bend}
          onChange={(e) => preview(transformRows(layout, selected, Number(e.target.value), 0))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </label>
      <div className="range-captions">
        <span>К сцене</span>
        <button
          className="text-button"
          onClick={() => change(transformRows(layout, selected, 0, 0))}
        >
          Выпрямить
        </button>
        <span>От сцены</span>
      </div>
      <p className="tool-hint">
        Потяните фиолетовую ручку на плане или двигайте ползунок — дуга меняется сразу. Меняются
        целые ряды.
      </p>
      <label>
        Поворот рядов, °
        <input
          type="number"
          min={-180}
          max={180}
          value={rotation}
          onChange={(e) => {
            const next = Math.max(-180, Math.min(180, Number(e.target.value)))
            change(transformRows(layout, selected, bend, next - rotation))
            setRotation(next)
          }}
        />
      </label>
      <div className="segmented-actions">
        {[-15, 15].map((angle) => (
          <button
            key={angle}
            className="button secondary small"
            onClick={() => change(transformRows(layout, selected, bend, angle))}
          >
            {angle > 0 ? '+' : ''}
            {angle}°
          </button>
        ))}
      </div>
    </ToolSection>
  )
}
function AppearanceTools({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  const style = appearanceOf(shape),
    patch = (value: Partial<typeof style>) =>
      onChange({ ...shape, appearance: { ...style, ...value } })
  return (
    <>
      <ToolSection title="Штриховка и детали">
        <label>
          Заливка узором
          <select
            value={style.pattern}
            onChange={(e) => patch({ pattern: e.target.value as typeof style.pattern })}
          >
            {Object.entries({
              auto: 'По типу объекта',
              none: 'Без штриховки',
              diagonal: 'Диагональная',
              cross: 'Перекрёстная',
              dots: 'Точки',
              horizontal: 'Горизонтальная',
              vertical: 'Вертикальная',
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Цвет штриховки
          <input
            type="color"
            value={style.pattern_color}
            onChange={(e) => patch({ pattern_color: e.target.value })}
          />
        </label>
        <div className="form-grid">
          {(['pattern_spacing', 'pattern_angle', 'pattern_width'] as const).map((k) => (
            <label key={k}>
              {
                {
                  pattern_spacing: 'Шаг штриховки',
                  pattern_angle: 'Угол штриховки',
                  pattern_width: 'Толщина штриховки',
                }[k]
              }
              <input
                type="number"
                value={style[k]}
                min={k === 'pattern_angle' ? -180 : k === 'pattern_width' ? 0.25 : 4}
                max={k === 'pattern_angle' ? 180 : k === 'pattern_width' ? 5 : 80}
                step={k === 'pattern_width' ? 0.25 : 1}
                onChange={(e) => patch({ [k]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={style.details_visible}
            onChange={(e) => patch({ details_visible: e.target.checked })}
          />
          Детали объекта
        </label>
      </ToolSection>
      <ToolSection title="Подпись и значок">
        <label className="check">
          <input
            type="checkbox"
            checked={style.label_visible}
            onChange={(e) => patch({ label_visible: e.target.checked })}
          />
          Показать подпись
        </label>
        {'kind' in shape && (
          <label className="check">
            <input
              type="checkbox"
              checked={style.icon_visible}
              onChange={(e) => patch({ icon_visible: e.target.checked })}
            />
            Показать значок
          </label>
        )}
        <div className="form-grid">
          <label>
            Цвет подписи
            <input
              type="color"
              value={style.label_color}
              onChange={(e) => patch({ label_color: e.target.value })}
            />
          </label>
          <label>
            Размер подписи
            <input
              type="number"
              min={6}
              max={40}
              value={style.label_size}
              onChange={(e) => patch({ label_size: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="tool-hint">
          Значок и подпись можно перетаскивать прямо внутри выбранного объекта. Белая подложка
          сохраняет читаемость.
        </p>
        <button
          className="button secondary full"
          onClick={() => patch({ label_position: null, icon_position: null })}
        >
          Разместить автоматически
        </button>
      </ToolSection>
      <ToolSection title="Линия контура">
        <label>
          Цвет контура
          <input
            type="color"
            value={style.outline_color}
            onChange={(e) => patch({ outline_color: e.target.value })}
          />
        </label>
        <label>
          Толщина контура
          <input
            type="number"
            min={0}
            max={6}
            step={0.5}
            value={style.outline_width}
            onChange={(e) => patch({ outline_width: Number(e.target.value) })}
          />
        </label>
      </ToolSection>
    </>
  )
}

export function ShapeInspector({
  shape,
  onChange,
  label,
  onDraw,
}: {
  shape: Shape
  onChange: (s: Shape) => void
  label: string
  onDraw: () => void
}) {
  return (
    <>
      <h3>{label}</h3>
      <label>
        Надпись
        <input
          value={shape.label}
          maxLength={80}
          onChange={(e) => onChange({ ...shape, label: e.target.value })}
        />
      </label>
      <ToolSection title="Форма и контур" open>
        <div className="shape-palette">
          {shapePresets.map((p) => (
            <button
              key={p.id}
              title={p.name}
              aria-label={`Форма: ${p.name}`}
              onClick={() => onChange(withForm(shape, p.id))}
            >
              <svg viewBox="0 0 50 38" aria-hidden="true">
                <ShapeGlyph
                  shape={{
                    x: 4,
                    y: 4,
                    width: 42,
                    height: 30,
                    label: '',
                    shape: p.shape,
                    points: p.points,
                  }}
                  color="#e9e4fb"
                />
              </svg>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <button className="button secondary full" onClick={onDraw}>
          Нарисовать свой контур
        </button>
        {shape.shape === 'polygon' && (
          <p className="tool-hint">
            Белые точки — узлы. Тяните их, чтобы менять контур; пунктирная точка добавляет узел,
            двойной клик удаляет.
          </p>
        )}
      </ToolSection>
      <ToolSection title="Размер и положение">
        <div className="form-grid">
          {(['x', 'y', 'width', 'height', 'rotation'] as const).map((k) => (
            <label key={k}>
              {{ x: 'X', y: 'Y', width: 'Ширина', height: 'Высота', rotation: 'Поворот, °' }[k]}
              <input
                type="number"
                step={k === 'rotation' ? 5 : 10}
                min={
                  k === 'rotation'
                    ? -360
                    : k === 'width'
                      ? label === 'Сцена'
                        ? 60
                        : 10
                      : k === 'height'
                        ? label === 'Сцена'
                          ? 30
                          : 10
                        : 0
                }
                max={k === 'rotation' ? 360 : k === 'height' ? 1500 : 2000}
                value={shape[k] || 0}
                onChange={(e) => onChange({ ...shape, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </ToolSection>
      <AppearanceTools shape={shape} onChange={onChange} />
    </>
  )
}
export function ObjectTools({
  layout,
  change,
  level,
  setActive,
}: {
  layout: Layout
  change: (l: Layout) => void
  level: string
  setActive: (id: string | null) => void
}) {
  function add(kind: HallObject['kind']) {
    const id = newId(),
      small = ['column', 'table', 'plant'].includes(kind)
    let o: HallObject = {
      id,
      kind,
      label: objectNames[kind],
      x: 80,
      y: kind === 'table' ? 240 : 40,
      width: small ? 60 : kind === 'sofa' ? 180 : kind === 'fence' ? 220 : 160,
      height: small ? 60 : kind === 'bench' || kind === 'fence' ? 55 : 100,
      shape: small ? 'ellipse' : 'rect',
      level_id: level,
      color:
        kind === 'bar'
          ? '#e8d9ef'
          : kind === 'table'
            ? '#eee3d3'
            : kind === 'entrance'
              ? '#dcefe7'
              : kind === 'zone'
                ? '#eef0fc'
                : '#dce3ef',
      blocks_seats: [
        'column',
        'stairs',
        'bar',
        'technical',
        'table',
        'sofa',
        'bench',
        'fence',
        'sound',
        'plant',
      ].includes(kind),
    }
    // Keep new objects away from existing seating; reserve space for a table's chairs.
    const padding = kind === 'table' ? 70 : 14
    const occupied = [
      ...(levelOf(layout.stage) === level ? [layout.stage] : []),
      ...(layout.objects || []).filter((x) => levelOf(x) === level && x.kind !== 'zone'),
    ]
    let placed = false
    for (let y = 40; y <= layout.height - o.height - padding && !placed; y += 40) {
      for (let x = 40; x <= layout.width - o.width - padding; x += 40) {
        const left = x - padding,
          right = x + o.width + padding,
          top = y - padding,
          bottom = y + o.height + padding
        if (
          left < 12 ||
          top < 12 ||
          occupied.some(
            (q) => left < q.x + q.width && right > q.x && top < q.y + q.height && bottom > q.y,
          ) ||
          layout.seats.some(
            (s) =>
              levelOf(s) === level &&
              s.x > left - 12 &&
              s.x < right + 12 &&
              s.y > top - 12 &&
              s.y < bottom + 12,
          )
        )
          continue
        o = { ...o, x, y }
        placed = true
        break
      }
    }
    const v = variants[kind]?.[0]
    if (v) o = withVariant(o, v.id)
    change({ ...layout, objects: [...(layout.objects || []), o] })
    setActive(id)
  }
  return (
    <>
      <p className="tool-hint">
        Добавьте объект, затем выберите его на плане. Варианты и параметры появятся справа.
      </p>
      {(
        [
          { name: 'Зоны и мебель', kinds: ['zone', 'table', 'sofa', 'bench'] },
          { name: 'Навигация', kinds: ['entrance', 'exit', 'stairs', 'lift', 'wc', 'cloakroom'] },
          {
            name: 'Инфраструктура',
            kinds: ['bar', 'column', 'technical', 'sound', 'light', 'fence', 'plant', 'decoration'],
          },
        ] as { name: string; kinds: HallObject['kind'][] }[]
      ).map((group) => (
        <div key={group.name}>
          <div className="object-group-title">{group.name}</div>
          <div className="object-palette">
            {group.kinds.map((kind) => (
              <button
                key={kind}
                disabled={(layout.objects?.length || 0) >= 200}
                onClick={() => add(kind)}
                aria-label={`Добавить: ${objectNames[kind]}`}
              >
                <ObjectSymbol kind={kind} />
                <span>{objectNames[kind]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <ToolSection title="Объекты на уровне">
        <div className="object-list">
          {layout.objects
            ?.filter((o) => levelOf(o) === level)
            .map((o) => (
              <button key={o.id} onClick={() => setActive(o.id)}>
                <ObjectSymbol kind={o.kind} />
                <span>{o.label}</span>
              </button>
            ))}
          {!layout.objects?.some((o) => levelOf(o) === level) && (
            <p className="tool-hint">Пока пусто</p>
          )}
        </div>
      </ToolSection>
    </>
  )
}
function variantPreview(object: HallObject, id: NonNullable<HallObject['variant']>): HallObject {
  const o = withVariant(object, id),
    scale = Math.min(90 / o.width, 64 / o.height),
    width = o.width * scale,
    height = o.height * scale
  return { ...o, x: (100 - width) / 2, y: (74 - height) / 2, width, height, label: '', rotation: 0 }
}

export function ObjectInspector({
  object,
  patch,
  onDraw,
  onDelete,
  onCopy,
}: {
  object: HallObject
  patch: (o: HallObject) => void
  onDraw: () => void
  onDelete: () => void
  onCopy: () => void
}) {
  const options = variants[object.kind]
  return (
    <>
      <div className="inspector-heading">
        <ObjectSymbol kind={object.kind} />
        <span>{objectNames[object.kind]}</span>
      </div>
      {options && (
        <ToolSection title="Вариант оформления" open>
          <div className="variant-palette">
            {options.map((v) => (
              <button
                key={v.id}
                aria-label={`Вариант: ${v.name}`}
                className={object.variant === v.id ? 'active' : ''}
                onClick={() => patch(withVariant(object, v.id))}
              >
                <svg viewBox="0 0 100 74">
                  <ShapeGlyph shape={variantPreview(object, v.id)} color={object.color} />
                </svg>
                <span>{v.name}</span>
              </button>
            ))}
          </div>
        </ToolSection>
      )}
      <ShapeInspector
        shape={object}
        label="Объект"
        onChange={(s) => patch({ ...object, ...s })}
        onDraw={onDraw}
      />
      <ToolSection title="Цвет и поведение">
        <label>
          Цвет объекта
          <input
            type="color"
            value={object.color}
            onChange={(e) => patch({ ...object, color: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={object.blocks_seats}
            onChange={(e) => patch({ ...object, blocks_seats: e.target.checked })}
          />
          Препятствие для мест
        </label>
        <p className="tool-hint">
          Стол или танцпол — часть плана. Продаются только добавленные места.
        </p>
      </ToolSection>
      <div className="segmented-actions">
        <button className="button secondary small" onClick={onCopy}>
          <Copy size={16} />
          Копия
        </button>
        <button className="button danger small" onClick={onDelete}>
          <Trash2 size={16} />
          Удалить
        </button>
      </div>
    </>
  )
}
export function EmptyInspector() {
  return (
    <div className="empty-inspector">
      <MousePointer2 size={32} />
      <strong>Ничего не выбрано</strong>
      <p>Нажмите на место, сцену или объект. Здесь появятся его параметры.</p>
      <small>
        Номер ряда выделяет весь ряд.
        <br />
        Shift + клик добавляет места к выделению.
      </small>
    </div>
  )
}
