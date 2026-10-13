import type { Appearance, Point, Shape } from './types'
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export const appearanceOf = (s: Shape): Required<Appearance> => ({
  pattern: 'auto',
  pattern_color: '#94a0b4',
  pattern_spacing: 12,
  pattern_angle: 45,
  pattern_width: 1,
  outline_color: '#bac3d4',
  outline_width: 1,
  label_color: '#566074',
  label_size: 12,
  label_visible: true,
  icon_visible: true,
  details_visible: true,
  label_position: null,
  icon_position: null,
  ...s.appearance,
})
export function localPoint(s: Shape, p: Point): Point {
  const a = (-(s.rotation || 0) * Math.PI) / 180,
    dx = p.x - s.x - s.width / 2,
    dy = p.y - s.y - s.height / 2
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + s.width / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + s.height / 2,
  }
}
export function worldPoint(s: Shape, p: Point): Point {
  const a = ((s.rotation || 0) * Math.PI) / 180,
    dx = p.x - s.width / 2,
    dy = p.y - s.height / 2
  return {
    x: s.x + s.width / 2 + dx * Math.cos(a) - dy * Math.sin(a),
    y: s.y + s.height / 2 + dx * Math.sin(a) + dy * Math.cos(a),
  }
}
export function contains(s: Shape, p: Point): boolean {
  if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return false
  if (s.shape === 'ellipse') return ((p.x - 0.5) * 2) ** 2 + ((p.y - 0.5) * 2) ** 2 <= 1
  if (s.shape !== 'polygon') return true
  const ps = s.points || []
  let inside = false
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i],
      b = ps[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}
/** Search for a badge rectangle inside concave contours; clipping remains the final guard. */
export function safeAnchor(
  s: Shape,
  preferred: Point | null,
  width: number,
  height: number,
): Point {
  const target = preferred || { x: 0.5, y: 0.5 },
    fits = (p: Point) =>
      [-0.5, -0.25, 0, 0.25, 0.5].every((x) =>
        [-0.5, -0.25, 0, 0.25, 0.5].every((y) =>
          contains(s, { x: p.x + (x * width) / s.width, y: p.y + (y * height) / s.height }),
        ),
      )
  if (fits(target)) return target
  let best: Point | null = null,
    d = Infinity
  for (let y = 1; y < 24; y++)
    for (let x = 1; x < 24; x++) {
      const p = { x: x / 24, y: y / 24 },
        dist = (p.x - target.x) ** 2 + (p.y - target.y) ** 2
      if (dist < d && fits(p)) {
        best = p
        d = dist
      }
    }
  if (best) return best
  // Very thin contours: the icon/text is clipped, with its center still inside.
  for (let y = 1; y < 24; y++)
    for (let x = 1; x < 24; x++) {
      const p = { x: x / 24, y: y / 24 },
        dist = (p.x - target.x) ** 2 + (p.y - target.y) ** 2
      if (dist < d && contains(s, p)) {
        best = p
        d = dist
      }
    }
  return best || target
}
export function shapeBounds(s: Shape) {
  if (s.shape === 'ellipse') {
    const a = ((s.rotation || 0) * Math.PI) / 180,
      rx = Math.hypot((s.width / 2) * Math.cos(a), (s.height / 2) * Math.sin(a)),
      ry = Math.hypot((s.width / 2) * Math.sin(a), (s.height / 2) * Math.cos(a))
    return {
      left: s.x + s.width / 2 - rx,
      right: s.x + s.width / 2 + rx,
      top: s.y + s.height / 2 - ry,
      bottom: s.y + s.height / 2 + ry,
    }
  }
  const ps = (
    s.shape === 'polygon'
      ? s.points || []
      : [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ]
  ).map((p) => worldPoint(s, { x: p.x * s.width, y: p.y * s.height }))
  return {
    left: Math.min(...ps.map((p) => p.x)),
    right: Math.max(...ps.map((p) => p.x)),
    top: Math.min(...ps.map((p) => p.y)),
    bottom: Math.max(...ps.map((p) => p.y)),
  }
}
export function withinCanvas(s: Shape, width: number, height: number) {
  const b = shapeBounds(s)
  return b.left >= -1e-7 && b.top >= -1e-7 && b.right <= width + 1e-7 && b.bottom <= height + 1e-7
}
export function resizeShape(
  s: Shape,
  handle: ResizeHandle,
  from: Point,
  to: Point,
  aspect = false,
  minWidth = 10,
  minHeight = 10,
): Shape {
  const a = localPoint(s, from),
    b = localPoint(s, to),
    dx = b.x - a.x,
    dy = b.y - a.y
  let left = handle.includes('w') ? Math.min(dx, s.width - minWidth) : 0,
    right = handle.includes('e') ? Math.max(minWidth, s.width + dx) : s.width,
    top = handle.includes('n') ? Math.min(dy, s.height - minHeight) : 0,
    bottom = handle.includes('s') ? Math.max(minHeight, s.height + dy) : s.height
  if (aspect && handle.length === 2) {
    const factor =
        Math.abs(dx / s.width) > Math.abs(dy / s.height)
          ? (right - left) / s.width
          : (bottom - top) / s.height,
      scale = Math.max(factor, minWidth / s.width, minHeight / s.height)
    if (handle.includes('w')) left = right - s.width * scale
    else right = left + s.width * scale
    if (handle.includes('n')) top = bottom - s.height * scale
    else bottom = top + s.height * scale
  }
  const width = right - left,
    height = bottom - top,
    center = worldPoint(s, { x: (left + right) / 2, y: (top + bottom) / 2 })
  return { ...s, x: center.x - width / 2, y: center.y - height / 2, width, height }
}
export function moveVertex(
  s: Shape,
  index: number,
  world: Point,
  minWidth = 10,
  minHeight = 10,
): Shape {
  const p = localPoint(s, world),
    points = s.points!.map((v, i) => (i === index ? p : { x: v.x * s.width, y: v.y * s.height }))
  const left = Math.min(...points.map((p) => p.x)),
    top = Math.min(...points.map((p) => p.y)),
    width = Math.max(...points.map((p) => p.x)) - left,
    height = Math.max(...points.map((p) => p.y)) - top
  if (width < minWidth || height < minHeight) return s
  const center = worldPoint(s, { x: left + width / 2, y: top + height / 2 })
  return {
    ...s,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    points: points.map((p) => ({ x: (p.x - left) / width, y: (p.y - top) / height })),
  }
}

export function resizeCursor(handle: ResizeHandle, rotation = 0) {
  const x = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
    y = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  const index = ((Math.round(((Math.atan2(y, x) * 180) / Math.PI + rotation) / 45) % 4) + 4) % 4
  return `${['ew', 'nwse', 'ns', 'nesw'][index]}-resize`
}
