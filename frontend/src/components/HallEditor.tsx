import {
  ArrowLeft,
  Copy,
  Download,
  Grid3X3,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { api, post, useAuth } from '../api'
import {
  emptyLayout,
  levelOf,
  levelsOf,
  money,
  newId,
  rowMarkers,
  type Hall,
  type Layout,
  type Seat,
  type Point,
} from '../types'
import { hallPreset } from '../hallPresets'
import { ShapeGlyph } from './HallGeometry'
import { LevelTools, ObjectTools, RowTools, ShapeInspector } from './EditorTools'

export function HallEditor({
  hall,
  onClose,
  onSaved,
}: {
  hall?: Hall
  onClose: () => void
  onSaved: (hall: Hall) => void
}) {
  const { user } = useAuth()
  const initialKey = `tf-layout:${user?.id}:${hall?.id || 'new'}`
  const [draft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(initialKey) || 'null')
      return saved?.revision === (hall?.revision || 0) ? saved : null
    } catch {
      return null
    }
  })
  const [layout, setLayout] = useState<Layout>(draft?.layout || hall?.layout || emptyLayout())
  const [name, setName] = useState(draft?.name || hall?.name || 'Новый зал')
  const [savedHall, setSavedHall] = useState(hall)
  const draftKey = `tf-layout:${user?.id}:${savedHall?.id || 'new'}`
  const [selected, setSelected] = useState<string[]>([])
  const [past, setPast] = useState<Layout[]>([])
  const [future, setFuture] = useState<Layout[]>([])
  const [zoom, setZoom] = useState(1)
  const [tool, setTool] = useState<'select' | 'seat' | 'stage-outline' | 'object-outline'>('select')
  const [level, setLevel] = useState(levelsOf(layout)[0].id)
  const [activeObject, setActiveObject] = useState<string | null>(null)
  const [stageActive, setStageActive] = useState(false)
  const [outline, setOutline] = useState<Point[]>([])
  const visibleSeats = layout.seats.filter((s) => levelOf(s) === level)
  function chooseLevel(id: string) {
    setLevel(id)
    setSelected([])
    setActiveObject(null)
    setStageActive(false)
    setOutline([])
    setTool('select')
  }
  const [message, setMessage] = useState(draft ? 'Восстановлен локальный черновик' : '')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(!!draft)
  const [rows, setRows] = useState(5)
  const [columns, setColumns] = useState(12)
  const [section, setSection] = useState('Партер')
  const [rowStart, setRowStart] = useState(
    () => Math.max(0, ...layout.seats.map((s) => Number(s.row) || 0)) + 1,
  )
  const [category, setCategory] = useState(layout.categories[0].id)
  const svg = useRef<SVGSVGElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const gesture = useRef<{
    before: Layout
    x: number
    y: number
    ids: string[]
    stage: boolean
    moving: boolean
    objectId?: string
    vertex?: number
  } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (!levelsOf(layout).some((l) => l.id === level)) {
      setLevel(levelsOf(layout)[0].id)
      setSelected([])
      setActiveObject(null)
      setOutline([])
      setTool('select')
    }
  }, [layout.levels, level])
  useEffect(() => {
    const timer = setTimeout(() => {
      if (dirty)
        localStorage.setItem(
          draftKey,
          JSON.stringify({ layout, name, revision: savedHall?.revision || 0 }),
        )
    }, 500)
    return () => clearTimeout(timer)
  }, [layout, name, dirty, draftKey, savedHall])
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  function change(next: Layout) {
    setPast((p) => [...p.slice(-49), structuredClone(layout)])
    setFuture([])
    setLayout(next)
    setDirty(true)
    setMessage('')
  }
  function undo() {
    if (!past.length) return
    setFuture((f) => [layout, ...f])
    setLayout(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    setDirty(true)
  }
  function redo() {
    if (!future.length) return
    setPast((p) => [...p, layout])
    setLayout(future[0])
    setFuture((f) => f.slice(1))
    setDirty(true)
  }
  function modifySeats(patch: Partial<Seat>) {
    change({
      ...layout,
      seats: layout.seats.map((s) => (selected.includes(s.id) ? { ...s, ...patch } : s)),
    })
  }
  function remove() {
    change({ ...layout, seats: layout.seats.filter((s) => !selected.includes(s.id)) })
    setSelected([])
  }
  function keyboard(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
    }
    if (['Delete', 'Backspace'].includes(e.key) && selected.length) {
      e.preventDefault()
      remove()
    }
    if (e.key === 'Escape') {
      setSelected([])
      setOutline([])
      setTool('select')
    }
    if (e.key === 'Enter' && outline.length >= 3) finishOutline()
  }
  function addBlock() {
    const width = (columns - 1) * 34
    const y = Math.max(
      levelOf(layout.stage) === level ? layout.stage.y + layout.stage.height + 65 : 180,
      ...visibleSeats.map((s) => s.y + 50),
    )
    if (y + (rows - 1) * 42 > layout.height - 20 || width > layout.width - 80) {
      setMessage(
        'Блок не помещается. Уменьшите число рядов/мест или переместите существующие места.',
      )
      return
    }
    const seats: Seat[] = []
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < columns; c++)
        seats.push({
          id: newId(),
          x: (layout.width - width) / 2 + c * 34,
          y: y + r * 42,
          row: String(rowStart + r),
          number: String(c + 1),
          section,
          category_id: category,
          accessible: false,
          blocked: false,
          level_id: level,
        })
    change({ ...layout, seats: [...layout.seats, ...seats] })
    setSelected(seats.map((s) => s.id))
    setRowStart(rowStart + rows)
  }
  function point(e: PointerEvent) {
    const p = svg.current!.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    const world = p.matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: world.x, y: world.y }
  }
  function finishOutline() {
    if (outline.length < 3) {
      setMessage('Нужны хотя бы три вершины')
      return
    }
    const x = Math.min(...outline.map((p) => p.x)),
      y = Math.min(...outline.map((p) => p.y))
    const width = Math.max(...outline.map((p) => p.x)) - x,
      height = Math.max(...outline.map((p) => p.y)) - y
    if (
      width < (tool === 'stage-outline' ? 60 : 10) ||
      height < (tool === 'stage-outline' ? 30 : 10)
    ) {
      setMessage('Контур слишком маленький')
      return
    }
    const shape = {
      x,
      y,
      width,
      height,
      rotation: 0,
      shape: 'polygon' as const,
      points: outline.map((p) => ({ x: (p.x - x) / width, y: (p.y - y) / height })),
      level_id: level,
    }
    if (tool === 'stage-outline') {
      change({ ...layout, stage: { ...layout.stage, ...shape } })
      setStageActive(true)
    } else if (activeObject)
      change({
        ...layout,
        objects: layout.objects?.map((o) => (o.id === activeObject ? { ...o, ...shape } : o)),
      })
    setOutline([])
    setTool('select')
  }
  function start(e: PointerEvent, id?: string, stage = false, objectId?: string, vertex?: number) {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = point(e)
    if (tool.endsWith('outline')) {
      if (outline.length >= 64) {
        setMessage('Не больше 64 вершин')
        return
      }
      const next = {
        x: Math.round(Math.max(0, Math.min(layout.width, p.x)) / 5) * 5,
        y: Math.round(Math.max(0, Math.min(layout.height, p.y)) / 5) * 5,
      }
      if (!outline.some((q) => q.x === next.x && q.y === next.y)) setOutline([...outline, next])
      return
    }
    setStageActive(stage)
    setActiveObject(objectId || null)
    if (stage || objectId) setSelected([])
    if (tool === 'seat' && !id && !stage && !objectId) {
      const x = Math.round(p.x / 10) * 10,
        y = Math.round(p.y / 10) * 10
      if (x < 12 || y < 12 || x > layout.width - 12 || y > layout.height - 12) return
      const sameRow = layout.seats.filter(
        (s) => levelOf(s) === level && s.section === section && s.row === String(rowStart),
      )
      change({
        ...layout,
        seats: [
          ...layout.seats,
          {
            id: newId(),
            x,
            y,
            section,
            row: String(rowStart),
            number: String(Math.max(0, ...sameRow.map((s) => Number(s.number) || 0)) + 1),
            category_id: category,
            accessible: false,
            blocked: false,
            level_id: level,
          },
        ],
      })
      return
    }
    let ids: string[] = []
    if (id) {
      ids = e.shiftKey
        ? selected.includes(id)
          ? selected.filter((x) => x !== id)
          : [...selected, id]
        : selected.includes(id)
          ? selected
          : [id]
      setSelected(ids)
    } else if (!stage && !objectId) {
      setSelected([])
      setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    }
    gesture.current = {
      before: structuredClone(layout),
      ...p,
      ids,
      stage,
      moving: false,
      objectId,
      vertex,
    }
    svg.current!.setPointerCapture(e.pointerId)
  }
  function move(e: PointerEvent) {
    const g = gesture.current
    if (!g) return
    const p = point(e),
      dx = Math.round((p.x - g.x) / 10) * 10,
      dy = Math.round((p.y - g.y) / 10) * 10
    if (Math.abs(dx) + Math.abs(dy) < 5) return
    g.moving = true
    if (g.stage || g.objectId) {
      const s = g.stage ? g.before.stage : g.before.objects!.find((o) => o.id === g.objectId)!
      let next
      if (g.vertex !== undefined) {
        const angle = (-(s.rotation || 0) * Math.PI) / 180
        const ox = p.x - s.x - s.width / 2,
          oy = p.y - s.y - s.height / 2
        const local = {
          x: Math.max(
            0,
            Math.min(1, (ox * Math.cos(angle) - oy * Math.sin(angle)) / s.width + 0.5),
          ),
          y: Math.max(
            0,
            Math.min(1, (ox * Math.sin(angle) + oy * Math.cos(angle)) / s.height + 0.5),
          ),
        }
        next = { ...s, points: s.points!.map((v, i) => (i === g.vertex ? local : v)) }
      } else
        next = {
          ...s,
          x: Math.max(0, Math.min(layout.width - s.width, s.x + dx)),
          y: Math.max(0, Math.min(layout.height - s.height, s.y + dy)),
        }
      setLayout(
        g.stage
          ? { ...g.before, stage: next }
          : {
              ...g.before,
              objects: g.before.objects!.map((o) => (o.id === g.objectId ? { ...o, ...next } : o)),
            },
      )
    } else if (g.ids.length) {
      const moving = g.before.seats.filter((s) => g.ids.includes(s.id))
      const boundedX = Math.max(
        12 - Math.min(...moving.map((s) => s.x)),
        Math.min(dx, layout.width - 12 - Math.max(...moving.map((s) => s.x))),
      )
      const boundedY = Math.max(
        12 - Math.min(...moving.map((s) => s.y)),
        Math.min(dy, layout.height - 12 - Math.max(...moving.map((s) => s.y))),
      )
      setLayout({
        ...g.before,
        seats: g.before.seats.map((s) =>
          g.ids.includes(s.id) ? { ...s, x: s.x + boundedX, y: s.y + boundedY } : s,
        ),
      })
    } else {
      const next = {
        x: Math.min(g.x, p.x),
        y: Math.min(g.y, p.y),
        w: Math.abs(p.x - g.x),
        h: Math.abs(p.y - g.y),
      }
      setBox(next)
      setSelected(
        visibleSeats
          .filter(
            (s) =>
              s.x >= next.x && s.x <= next.x + next.w && s.y >= next.y && s.y <= next.y + next.h,
          )
          .map((s) => s.id),
      )
    }
  }
  function finish() {
    const g = gesture.current
    if (g?.moving && (g.stage || g.objectId || g.ids.length)) {
      setPast((p) => [...p.slice(-49), g.before])
      setFuture([])
      setDirty(true)
      setMessage('')
    }
    gesture.current = null
    setBox(null)
  }
  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const body = { name, layout, revision: savedHall?.revision || 0 }
      const result = savedHall
        ? await api<Hall>(`/halls/${savedHall.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await post<Hall>('/halls', body)
      setSavedHall(result)
      setDirty(false)
      localStorage.removeItem(draftKey)
      onSaved(result)
      setMessage('Схема сохранена на сервере. Можно использовать в концерте.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function duplicate() {
    const copies = layout.seats
      .filter((s) => selected.includes(s.id))
      .map((s) => ({
        ...s,
        id: newId(),
        x: s.x + 34,
        y: s.y + 42,
        row: `${s.row}к${layout.seats.length}`,
      }))
    change({ ...layout, seats: [...layout.seats, ...copies] })
    setSelected(copies.map((s) => s.id))
  }
  function exportLayout() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ name, layout }, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'hall-layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  async function importLayout(input: File) {
    try {
      if (input.size > 2_000_000) throw new Error('Файл больше 2 МБ')
      const data = JSON.parse(await input.text())
      if (
        !data.layout ||
        !Array.isArray(data.layout.seats) ||
        !data.layout.stage ||
        !Array.isArray(data.layout.categories) ||
        data.layout.categories.length < 1 ||
        data.layout.seats.length > 5000 ||
        !data.layout.seats.every(
          (s: Seat) => typeof s.id === 'string' && Number.isFinite(s.x) && Number.isFinite(s.y),
        ) ||
        !data.layout.categories.every(
          (c: { id: string; color: string; price: number }) =>
            typeof c.id === 'string' &&
            /^#[0-9a-fA-F]{6}$/.test(c.color) &&
            Number.isInteger(c.price),
        )
      )
        throw new Error('Некорректный формат схемы')
      // The service performs the authoritative schema, bounds and collision validation.
      const validated = await post<Hall>('/halls', {
        name: `Импорт: ${String(data.name || 'Зал').slice(0, 100)}`,
        layout: data.layout,
        revision: 0,
      })
      change(validated.layout)
      setName(validated.name)
      setSavedHall(validated)
      setCategory(validated.layout.categories[0].id)
      setSelected([])
      chooseLevel(levelsOf(validated.layout)[0].id)
      setDirty(false)
      onSaved(validated)
      setMessage('Схема импортирована и проверена сервером')
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="editor" onKeyDown={keyboard}>
      <div className="editor-header">
        <button className="icon-button" aria-label="Вернуться к залам" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <input
            className="title-input"
            aria-label="Название зала"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDirty(true)
            }}
          />
          <div className="muted small">
            {layout.seats.length} мест · {dirty ? 'Локальный черновик' : 'Сохранено'} · Версия{' '}
            {savedHall?.revision || 0}
          </div>
        </div>
        <div className="spacer" />
        <button className="button secondary" onClick={exportLayout}>
          <Download size={16} />
          Экспорт
        </button>
        <button className="button primary" disabled={busy} onClick={save}>
          <Save size={16} />
          {busy ? 'Проверка…' : 'Сохранить зал'}
        </button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="editor-grid">
        <aside className="editor-panel">
          <div className="eyebrow">КОНСТРУКТОР ЗАЛА</div>
          {!savedHall && (
            <details className="editor-presets">
              <summary>Начать с готовой основы</summary>
              <p className="small muted">Заменит текущую схему. Действие можно отменить.</p>
              {(
                [
                  ['theatre', 'Театр с балконами'],
                  ['club', 'Клуб и VIP-столы'],
                  ['arena', 'Арена с трибунами'],
                ] as const
              ).map(([kind, title]) => (
                <button
                  key={kind}
                  className="button secondary full"
                  onClick={() => {
                    const next = hallPreset(kind)
                    change(next)
                    setCategory(next.categories[0].id)
                    chooseLevel('ground')
                    setRowStart(
                      Math.max(
                        ...next.seats
                          .filter((s) => levelOf(s) === 'ground')
                          .map((s) => Number(s.row)),
                      ) + 1,
                    )
                  }}
                >
                  {title}
                </button>
              ))}
            </details>
          )}
          <LevelTools layout={layout} change={change} level={level} setLevel={chooseLevel} />
          <h3>Добавить ряды</h3>
          <label>
            Сектор
            <input value={section} maxLength={80} onChange={(e) => setSection(e.target.value)} />
          </label>
          <div className="form-grid">
            <label>
              Рядов
              <input
                type="number"
                min="1"
                max="20"
                value={rows}
                onChange={(e) => setRows(Math.max(1, Math.min(20, Number(e.target.value))))}
              />
            </label>
            <label>
              Мест в ряду
              <input
                type="number"
                min="1"
                max="40"
                value={columns}
                onChange={(e) => setColumns(Math.max(1, Math.min(40, Number(e.target.value))))}
              />
            </label>
          </div>
          <label>
            Начиная с ряда
            <input
              type="number"
              min="1"
              max="999"
              value={rowStart}
              onChange={(e) => setRowStart(Math.max(1, Math.min(999, Number(e.target.value))))}
            />
          </label>
          <label>
            Категория
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {layout.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary full" onClick={addBlock}>
            <Grid3X3 size={16} />
            Добавить блок рядов
          </button>
          <hr />
          <RowTools layout={layout} change={change} selected={selected} />
          <ObjectTools
            layout={layout}
            change={change}
            level={level}
            active={activeObject}
            setActive={(id) => {
              setActiveObject(id)
              setStageActive(false)
            }}
            onDraw={() => {
              setTool('object-outline')
              setOutline([])
            }}
          />
          <h3>Ценовые категории</h3>
          {layout.categories.map((c) => (
            <div key={c.id} className="category-edit">
              <input
                aria-label={`Цвет ${c.name}`}
                type="color"
                value={c.color}
                onChange={(e) =>
                  change({
                    ...layout,
                    categories: layout.categories.map((x) =>
                      x.id === c.id ? { ...x, color: e.target.value } : x,
                    ),
                  })
                }
              />
              <div>
                <input
                  aria-label="Название категории"
                  value={c.name}
                  maxLength={80}
                  onChange={(e) =>
                    change({
                      ...layout,
                      categories: layout.categories.map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <div className="price-input">
                  <input
                    aria-label={`Цена ${c.name}`}
                    type="number"
                    min="1"
                    step="1"
                    value={c.price / 100}
                    onChange={(e) =>
                      change({
                        ...layout,
                        categories: layout.categories.map((x) =>
                          x.id === c.id
                            ? { ...x, price: Math.round(Number(e.target.value) * 100) }
                            : x,
                        ),
                      })
                    }
                  />
                  <span>₽</span>
                </div>
              </div>
            </div>
          ))}
          <button
            className="text-button"
            disabled={layout.categories.length >= 20}
            onClick={() =>
              change({
                ...layout,
                categories: [
                  ...layout.categories,
                  { id: newId(), name: 'Новая категория', color: '#46a89b', price: 150000 },
                ],
              })
            }
          >
            <Plus size={15} />
            Категория
          </button>
          <hr />
          <button className="text-button" onClick={() => file.current?.click()}>
            <Upload size={15} />
            Импорт JSON
          </button>
          <input
            ref={file}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void importLayout(e.target.files[0])
              e.target.value = ''
            }}
          />
          <p className="small muted">
            Автосохранение черновика в этом браузере. Кнопка «Сохранить зал» проверяет схему и
            отправляет её на сервер.
          </p>
        </aside>
        <div className="editor-canvas">
          <div className="canvas-toolbar">
            <button
              aria-label="Выделение"
              className={`icon-button ${tool === 'select' ? 'active' : ''}`}
              onClick={() => setTool('select')}
            >
              <MousePointer2 size={18} />
            </button>
            <button
              aria-label="Добавить одно место"
              className={`icon-button ${tool === 'seat' ? 'active' : ''}`}
              onClick={() => setTool('seat')}
            >
              <Plus size={18} />
            </button>
            <span className="divider" />
            <button
              className="icon-button"
              aria-label="Отменить действие"
              disabled={!past.length}
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Повторить действие"
              disabled={!future.length}
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
            <div className="spacer" />
            <button
              className="icon-button"
              aria-label="Уменьшить"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              <ZoomOut size={18} />
            </button>
            <button className="text-button" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="icon-button"
              aria-label="Увеличить"
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            >
              <ZoomIn size={18} />
            </button>
          </div>
          <div className="editor-level-tabs">
            {levelsOf(layout).map((l) => (
              <button
                key={l.id}
                className={l.id === level ? 'active' : ''}
                onClick={() => chooseLevel(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
          {tool.endsWith('outline') && (
            <div className="contour-toolbar">
              <span>Кликайте по вершинам контура · {outline.length}/64</span>
              <button
                className="button primary small"
                disabled={outline.length < 3}
                onClick={finishOutline}
              >
                Завершить контур
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setOutline([])
                  setTool('select')
                }}
              >
                Отмена
              </button>
            </div>
          )}
          <div className="canvas-scroll">
            <svg
              ref={svg}
              className="editor-svg"
              style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 650}px` }}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              onPointerDown={(e) => start(e)}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={finish}
              aria-label="Редактор схемы зала"
            >
              <defs>
                <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#e0e3eb" />
                </pattern>
              </defs>
              <rect width={layout.width} height={layout.height} fill="url(#dots)" />
              {(layout.objects || [])
                .filter((o) => levelOf(o) === level && o.kind === 'zone')
                .map((o) => (
                  <ShapeGlyph
                    key={o.id}
                    shape={o}
                    color={o.color}
                    active={activeObject === o.id}
                    onPointerDown={(e) => start(e, undefined, false, o.id)}
                    onVertex={(e, index) => start(e, undefined, false, o.id, index)}
                  />
                ))}
              <g opacity={levelOf(layout.stage) === level ? 1 : 0.25}>
                <ShapeGlyph
                  shape={layout.stage}
                  active={stageActive}
                  onPointerDown={
                    levelOf(layout.stage) === level ? (e) => start(e, undefined, true) : undefined
                  }
                  onVertex={(e, index) => start(e, undefined, true, undefined, index)}
                />
              </g>
              {(layout.objects || [])
                .filter((o) => levelOf(o) === level && o.kind !== 'zone')
                .map((o) => (
                  <ShapeGlyph
                    key={o.id}
                    shape={o}
                    color={o.color}
                    active={activeObject === o.id}
                    onPointerDown={(e) => start(e, undefined, false, o.id)}
                    onVertex={(e, index) => start(e, undefined, false, o.id, index)}
                  />
                ))}
              {visibleSeats.map((s) => (
                <g
                  key={s.id}
                  onPointerDown={(e) => start(e, s.id)}
                  className="draggable"
                  role="button"
                  tabIndex={0}
                  aria-label={`Ряд ${s.row}, место ${s.number}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(e.shiftKey ? [...new Set([...selected, s.id])] : [s.id])
                    }
                  }}
                >
                  <path
                    d="M -7 7 Q 0 12 7 7"
                    transform={`translate(${s.x} ${s.y}) rotate(${s.rotation || 0})`}
                    fill="none"
                    stroke="#303850"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r="10"
                    fill={
                      s.blocked
                        ? '#cbd0dc'
                        : layout.categories.find((c) => c.id === s.category_id)?.color
                    }
                    stroke={selected.includes(s.id) ? '#222944' : '#fff'}
                    strokeWidth={selected.includes(s.id) ? 3 : 1}
                  />
                  <text
                    x={s.x}
                    y={s.y + 3}
                    textAnchor="middle"
                    fill="white"
                    fontSize="8"
                    pointerEvents="none"
                  >
                    {s.accessible ? '♿' : s.number}
                  </text>
                </g>
              ))}
              {rowMarkers(visibleSeats).map((row) => (
                <text
                  key={row.key}
                  x={row.x - 24}
                  y={row.y + 4}
                  textAnchor="end"
                  fill="#8992a5"
                  fontSize="11"
                  className="seat-interactive"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setSelected(
                      layout.seats
                        .filter(
                          (s) =>
                            levelOf(s) === level && s.section === row.section && s.row === row.row,
                        )
                        .map((s) => s.id),
                    )
                  }}
                >
                  <title>
                    {row.section}, ряд {row.row}: выбрать весь ряд
                  </title>
                  {row.row}
                </text>
              ))}
              {outline.length > 0 && (
                <g pointerEvents="none">
                  <polyline
                    points={outline.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="#7561ef18"
                    stroke="#7561ef"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                  {outline.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={5} fill="#7561ef" />
                  ))}
                </g>
              )}
              {box && (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="#6960e81a"
                  stroke="#6960e8"
                  strokeDasharray="5 3"
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>
          <div className="canvas-footer">
            <span>
              {tool === 'seat'
                ? 'Нажмите на свободную область, чтобы добавить место'
                : 'Выделите рамкой или Shift + клик. Перетаскивайте места и сцену.'}
            </span>
            <span>⌘/Ctrl Z — отмена</span>
          </div>
        </div>
        <aside className="editor-panel inspector">
          <div className="eyebrow">СВОЙСТВА</div>
          <h3>{selected.length ? `Выбрано: ${selected.length}` : 'Выберите места'}</h3>
          {selected.length ? (
            <>
              <label>
                Категория
                <select value="" onChange={(e) => modifySeats({ category_id: e.target.value })}>
                  <option value="" disabled>
                    Назначить категорию
                  </option>
                  {layout.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {money(c.price)}
                    </option>
                  ))}
                </select>
              </label>
              {selected.length === 1 &&
                (() => {
                  const seat = layout.seats.find((s) => s.id === selected[0])
                  return seat ? (
                    <>
                      <label>
                        Сектор
                        <input
                          value={seat.section}
                          onChange={(e) => modifySeats({ section: e.target.value })}
                        />
                      </label>
                      <div className="form-grid">
                        <label>
                          Ряд
                          <input
                            value={seat.row}
                            onChange={(e) => modifySeats({ row: e.target.value })}
                          />
                        </label>
                        <label>
                          Место
                          <input
                            value={seat.number}
                            onChange={(e) => modifySeats({ number: e.target.value })}
                          />
                        </label>
                      </div>
                    </>
                  ) : null
                })()}
              <label className="check">
                <input
                  type="checkbox"
                  checked={layout.seats
                    .filter((s) => selected.includes(s.id))
                    .every((s) => s.accessible)}
                  onChange={(e) => modifySeats({ accessible: e.target.checked })}
                />
                Доступные места
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={layout.seats
                    .filter((s) => selected.includes(s.id))
                    .every((s) => s.blocked)}
                  onChange={(e) => modifySeats({ blocked: e.target.checked })}
                />
                Не продавать
              </label>
              <button className="button secondary full" onClick={duplicate}>
                <Copy size={16} />
                Дублировать
              </button>
              <button className="button danger full" onClick={remove}>
                <Trash2 size={16} />
                Удалить
              </button>
            </>
          ) : (
            <p className="muted small">
              Выделение позволяет назначить цену всему ряду или сектору сразу.
            </p>
          )}
          <hr />
          <ShapeInspector
            shape={layout.stage}
            label="Сцена"
            onChange={(stage) => change({ ...layout, stage })}
            onDraw={() => {
              chooseLevel(levelOf(layout.stage))
              setTool('stage-outline')
              setOutline([])
            }}
          />
          <hr />
          <div className="small muted">
            При сохранении проверяются пересечения, границы, нумерация и цены. Опубликованные
            концерты используют отдельную копию этой схемы.
          </div>
        </aside>
      </div>
    </div>
  )
}
