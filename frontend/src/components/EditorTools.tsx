import { useState } from 'react'
import { Layers, Plus, RotateCw, Trash2 } from 'lucide-react'
import { levelOf, levelsOf, newId, type HallObject, type Layout, type Shape } from '../types'

export const objectNames: Record<HallObject['kind'], string> = {
  zone: 'Зона / танцпол',
  table: 'Стол',
  bar: 'Бар',
  column: 'Колонна',
  stairs: 'Лестница',
  entrance: 'Вход',
  technical: 'Техническая зона',
  decoration: 'Свободный объект',
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
      <label>
        Рабочий уровень
        <select value={current.id} onChange={(e) => setLevel(e.target.value)}>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
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
        className="text-button"
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
      <p className="small muted">
        Каждый ярус — отдельный слой. Места на разных этажах могут находиться друг над другом.
      </p>
      <hr />
    </>
  )
}

export function RowTools({
  layout,
  change,
  selected,
}: {
  layout: Layout
  change: (l: Layout) => void
  selected: string[]
}) {
  const [bend, setBend] = useState(0),
    [rotation, setRotation] = useState(0)
  return (
    <>
      <h3>Геометрия рядов</h3>
      <label>
        Изгиб ряда
        <input
          type="range"
          aria-label="Изгиб ряда"
          min={-180}
          max={180}
          value={bend}
          onChange={(e) => setBend(Number(e.target.value))}
        />
        <span className="small muted">{bend} — от прямого ряда до дуги</span>
      </label>
      <label>
        Поворот рядов, °
        <input
          type="number"
          min={-180}
          max={180}
          value={rotation}
          onChange={(e) => setRotation(Math.max(-180, Math.min(180, Number(e.target.value))))}
        />
      </label>
      <button
        className="button secondary full"
        disabled={!selected.length}
        onClick={() => change(transformRows(layout, selected, bend, rotation))}
      >
        <RotateCw size={16} />
        Применить к рядам
      </button>
      <p className="small muted">
        Выберите места или номер ряда. Меняется весь ряд, ID и номера сохраняются. Поворот
        добавляется к текущему направлению; изгиб задаётся заново.
      </p>
      <hr />
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
      <label>
        Форма
        <select
          value={shape.shape || 'rect'}
          onChange={(e) => {
            const value = e.target.value as Shape['shape']
            onChange({
              ...shape,
              shape: value,
              points:
                value === 'polygon'
                  ? [
                      { x: 0, y: 0 },
                      { x: 1, y: 0 },
                      { x: 1, y: 1 },
                      { x: 0.6, y: 1 },
                      { x: 0.6, y: 0.6 },
                      { x: 0, y: 0.6 },
                    ]
                  : [],
            })
          }}
        >
          <option value="rect">Прямоугольник</option>
          <option value="ellipse">Эллипс / круг</option>
          <option value="polygon">Свободный контур</option>
        </select>
      </label>
      <button className="text-button" onClick={onDraw}>
        Нарисовать свой контур
      </button>
      <button
        className="text-button"
        onClick={() =>
          onChange({
            ...shape,
            shape: 'polygon',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              ...Array.from({ length: 15 }, (_, i) => {
                const a = ((i + 1) * Math.PI) / 16
                return { x: 0.5 + 0.5 * Math.cos(a), y: Math.sin(a) }
              }),
            ],
          })
        }
      >
        Сцена полукругом
      </button>
      <div className="form-grid">
        {(['x', 'y', 'width', 'height', 'rotation'] as const).map((k) => (
          <label key={k}>
            {{ x: 'X', y: 'Y', width: 'Ширина', height: 'Высота', rotation: 'Поворот, °' }[k]}
            <input
              type="number"
              step={k === 'rotation' ? 5 : 10}
              min={k === 'rotation' ? -360 : k === 'width' || k === 'height' ? 10 : 0}
              max={k === 'rotation' ? 360 : 2000}
              value={shape[k] || 0}
              onChange={(e) => onChange({ ...shape, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      {shape.shape === 'polygon' && (
        <p className="small muted">
          Выберите контур на схеме и перетащите белые вершины. Размеры изменяют весь контур.
        </p>
      )}
    </>
  )
}

export function ObjectTools({
  layout,
  change,
  level,
  active,
  setActive,
  onDraw,
}: {
  layout: Layout
  change: (l: Layout) => void
  level: string
  active: string | null
  setActive: (id: string | null) => void
  onDraw: () => void
}) {
  const [kind, setKind] = useState<HallObject['kind']>('zone')
  const object = layout.objects?.find((o) => o.id === active)
  function patch(shape: Shape) {
    if (object)
      change({
        ...layout,
        objects: layout.objects?.map((o) => (o.id === object.id ? { ...o, ...shape } : o)),
      })
  }
  return (
    <>
      <h3>Объекты и зоны</h3>
      <label>
        Тип объекта
        <select value={kind} onChange={(e) => setKind(e.target.value as HallObject['kind'])}>
          {Object.entries(objectNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button secondary full"
        disabled={(layout.objects?.length || 0) >= 200}
        onClick={() => {
          const id = newId()
          change({
            ...layout,
            objects: [
              ...(layout.objects || []),
              {
                id,
                kind,
                label: objectNames[kind],
                x: 80,
                y: 40,
                width: kind === 'column' ? 40 : 120,
                height: kind === 'column' ? 40 : 70,
                shape: ['column', 'table'].includes(kind) ? 'ellipse' : 'rect',
                level_id: level,
                color: kind === 'zone' ? '#eef0fc' : '#dce3ef',
                blocks_seats: ['column', 'stairs', 'bar', 'technical'].includes(kind),
              },
            ],
          })
          setActive(id)
        }}
      >
        <Plus size={16} />
        Добавить объект
      </button>
      <label>
        Объекты уровня
        <select value={active || ''} onChange={(e) => setActive(e.target.value || null)}>
          <option value="">Выберите объект</option>
          {layout.objects
            ?.filter((o) => levelOf(o) === level)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
      </label>
      {object && (
        <>
          <ShapeInspector
            shape={object}
            label="Свойства объекта"
            onChange={patch}
            onDraw={onDraw}
          />
          <label>
            Цвет объекта
            <input
              type="color"
              value={object.color}
              onChange={(e) =>
                change({
                  ...layout,
                  objects: layout.objects?.map((o) =>
                    o.id === object.id ? { ...o, color: e.target.value } : o,
                  ),
                })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={object.blocks_seats}
              onChange={(e) =>
                change({
                  ...layout,
                  objects: layout.objects?.map((o) =>
                    o.id === object.id ? { ...o, blocks_seats: e.target.checked } : o,
                  ),
                })
              }
            />
            Препятствие для мест
          </label>
          <button
            className="button danger full"
            onClick={() => {
              change({ ...layout, objects: layout.objects?.filter((o) => o.id !== object.id) })
              setActive(null)
            }}
          >
            <Trash2 size={16} />
            Удалить объект
          </button>
        </>
      )}
      <p className="small muted">
        Зоны служат подложкой. Для колонн, баров и технических объектов можно запретить пересечение
        с местами. Столы сами по себе не являются билетами.
      </p>
      <hr />
    </>
  )
}
