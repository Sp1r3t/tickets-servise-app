import { levelOf, newId, type HallObject, type Layout, type Seat, type Shape } from './types'
import { shapeBounds } from './editorGeometry'
export type Selection = { seats: string[]; objects: string[]; stage: boolean }
export type Alignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'
export type EditorClipboard = { seats: Seat[]; objects: HallObject[]; stage?: Shape }
function items(layout: Layout, s: Selection) {
  return [
    ...layout.seats
      .filter((x) => s.seats.includes(x.id))
      .map((x) => ({
        id: x.id,
        b: { left: x.x - 12, right: x.x + 12, top: x.y - 12, bottom: x.y + 12 },
      })),
    ...(layout.objects || [])
      .filter((x) => s.objects.includes(x.id))
      .map((x) => ({ id: x.id, b: shapeBounds(x) })),
    ...(s.stage ? [{ id: '@stage', b: shapeBounds(layout.stage) }] : []),
  ]
}
export function alignLayout(layout: Layout, s: Selection, alignment: Alignment): Layout {
  const selected = items(layout, s)
  if (!selected.length) return layout
  const bounds =
    selected.length === 1
      ? { left: 0, top: 0, right: layout.width, bottom: layout.height }
      : {
          left: Math.min(...selected.map((x) => x.b.left)),
          right: Math.max(...selected.map((x) => x.b.right)),
          top: Math.min(...selected.map((x) => x.b.top)),
          bottom: Math.max(...selected.map((x) => x.b.bottom)),
        }
  const delta = new Map(
    selected.map(({ id, b }) => [
      id,
      {
        x:
          alignment === 'left'
            ? bounds.left - b.left
            : alignment === 'right'
              ? bounds.right - b.right
              : alignment === 'center-x'
                ? (bounds.left + bounds.right - b.left - b.right) / 2
                : 0,
        y:
          alignment === 'top'
            ? bounds.top - b.top
            : alignment === 'bottom'
              ? bounds.bottom - b.bottom
              : alignment === 'center-y'
                ? (bounds.top + bounds.bottom - b.top - b.bottom) / 2
                : 0,
      },
    ]),
  )
  const shift = <T extends { x: number; y: number }>(item: T, id: string): T => {
    const d = delta.get(id)
    return d ? { ...item, x: Math.max(0, item.x + d.x), y: Math.max(0, item.y + d.y) } : item
  }
  return {
    ...layout,
    stage: shift(layout.stage, '@stage'),
    objects: layout.objects?.map((x) => shift(x, x.id)),
    seats: layout.seats.map((x) => shift(x, x.id)),
  }
}
export function copySelection(layout: Layout, s: Selection): EditorClipboard {
  return structuredClone({
    seats: layout.seats.filter((x) => s.seats.includes(x.id)),
    objects: (layout.objects || []).filter((x) => s.objects.includes(x.id)),
    ...(s.stage ? { stage: layout.stage } : {}),
  })
}
export function pasteSelection(
  layout: Layout,
  clipboard: EditorClipboard,
  level: string,
  point?: { x: number; y: number },
): { layout: Layout; selection: Selection } {
  const objects = clipboard.objects.map((o) => ({
    ...o,
    id: newId(),
    level_id: level,
    label: (o.label + ' · копия').slice(0, 80),
  }))
  if (clipboard.stage)
    objects.push({
      ...clipboard.stage,
      id: newId(),
      kind: 'decoration',
      color: '#eaecf2',
      blocks_seats: true,
      level_id: level,
      label: (clipboard.stage.label + ' · копия').slice(0, 80),
    })
  const suffix = newId().slice(0, 6),
    seats = clipboard.seats.map((s) => ({
      ...s,
      id: newId(),
      level_id: level,
      row: s.row.slice(0, 21) + 'к' + suffix,
    }))
  const combined = { ...layout, objects, seats },
    selection = { seats: seats.map((s) => s.id), objects: objects.map((o) => o.id), stage: false },
    parts = items(combined, selection)
  if (!parts.length) return { layout, selection }
  const left = Math.min(...parts.map((x) => x.b.left)),
    top = Math.min(...parts.map((x) => x.b.top)),
    right = Math.max(...parts.map((x) => x.b.right)),
    bottom = Math.max(...parts.map((x) => x.b.bottom))
  const dx = Math.max(-left, Math.min((point?.x ?? left + 32) - left, layout.width - right)),
    dy = Math.max(-top, Math.min((point?.y ?? top + 32) - top, layout.height - bottom))
  return {
    layout: {
      ...layout,
      objects: [
        ...(layout.objects || []),
        ...objects.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
      ],
      seats: [...layout.seats, ...seats.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }))],
    },
    selection,
  }
}
export function deleteSelection(layout: Layout, s: Selection): Layout {
  return {
    ...layout,
    seats: layout.seats.filter((x) => !s.seats.includes(x.id)),
    objects: layout.objects?.filter((x) => !s.objects.includes(x.id)),
  }
}
export function bringToFront(layout: Layout, s: Selection): Layout {
  return {
    ...layout,
    objects: [
      ...(layout.objects || []).filter((o) => !s.objects.includes(o.id)),
      ...(layout.objects || []).filter((o) => s.objects.includes(o.id)),
    ],
  }
}
export const selectionOnLevel = (layout: Layout, level: string): Selection => ({
  seats: layout.seats.filter((s) => levelOf(s) === level).map((s) => s.id),
  objects: (layout.objects || []).filter((o) => levelOf(o) === level).map((o) => o.id),
  stage: false,
})
