import type { HallObject, Point, Shape } from './types'

const points = (pairs: number[][]): Point[] => pairs.map(([x, y]) => ({ x, y }))
const regular = (n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({
    x: 0.5 + 0.5 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n),
    y: 0.5 + 0.5 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n),
  }))
export const shapePresets: { id: string; name: string; shape: Shape['shape']; points?: Point[] }[] =
  [
    { id: 'rect', name: 'Прямоугольник', shape: 'rect' },
    { id: 'ellipse', name: 'Овал', shape: 'ellipse' },
    {
      id: 'triangle',
      name: 'Треугольник',
      shape: 'polygon',
      points: points([
        [0.5, 0],
        [1, 1],
        [0, 1],
      ]),
    },
    {
      id: 'trapezoid',
      name: 'Трапеция',
      shape: 'polygon',
      points: points([
        [0.2, 0],
        [0.8, 0],
        [1, 1],
        [0, 1],
      ]),
    },
    { id: 'diamond', name: 'Ромб', shape: 'polygon', points: regular(4) },
    { id: 'hexagon', name: 'Шестиугольник', shape: 'polygon', points: regular(6) },
    { id: 'octagon', name: 'Восьмиугольник', shape: 'polygon', points: regular(8) },
    {
      id: 'semicircle',
      name: 'Полукруг',
      shape: 'polygon',
      points: points([
        [0, 0],
        [1, 0],
        ...Array.from({ length: 15 }, (_, i) => {
          const a = ((i + 1) * Math.PI) / 16
          return [0.5 + 0.5 * Math.cos(a), Math.sin(a)]
        }),
      ]),
    },
    {
      id: 'l',
      name: 'Г-образная',
      shape: 'polygon',
      points: points([
        [0, 0],
        [1, 0],
        [1, 0.4],
        [0.4, 0.4],
        [0.4, 1],
        [0, 1],
      ]),
    },
    {
      id: 'u',
      name: 'П-образная',
      shape: 'polygon',
      points: points([
        [0, 0],
        [1, 0],
        [1, 1],
        [0.7, 1],
        [0.7, 0.3],
        [0.3, 0.3],
        [0.3, 1],
        [0, 1],
      ]),
    },
    {
      id: 't',
      name: 'Т-образная',
      shape: 'polygon',
      points: points([
        [0, 0],
        [1, 0],
        [1, 0.35],
        [0.65, 0.35],
        [0.65, 1],
        [0.35, 1],
        [0.35, 0.35],
        [0, 0.35],
      ]),
    },
    {
      id: 'cross',
      name: 'Крест',
      shape: 'polygon',
      points: points([
        [0.35, 0],
        [0.65, 0],
        [0.65, 0.35],
        [1, 0.35],
        [1, 0.65],
        [0.65, 0.65],
        [0.65, 1],
        [0.35, 1],
        [0.35, 0.65],
        [0, 0.65],
        [0, 0.35],
        [0.35, 0.35],
      ]),
    },
  ]
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
export const variants: Partial<
  Record<
    HallObject['kind'],
    { id: NonNullable<HallObject['variant']>; name: string; form: string }[]
  >
> = {
  stairs: [
    { id: 'straight', name: 'Прямая', form: 'rect' },
    { id: 'corner', name: 'С поворотом', form: 'l' },
    { id: 'double', name: 'Два марша', form: 'rect' },
    { id: 'spiral', name: 'Винтовая', form: 'ellipse' },
  ],
  bar: [
    { id: 'straight', name: 'Прямой', form: 'rect' },
    { id: 'corner', name: 'Угловой', form: 'l' },
    { id: 'island', name: 'Островной', form: 'ellipse' },
    { id: 'double', name: 'П-образный', form: 'u' },
  ],
  table: [
    { id: 'round', name: 'Круглый', form: 'ellipse' },
    { id: 'square', name: 'Квадратный', form: 'rect' },
    { id: 'long', name: 'Длинный', form: 'rect' },
  ],
  entrance: [
    { id: 'straight', name: 'Дверь', form: 'rect' },
    { id: 'double', name: 'Двойная', form: 'rect' },
  ],
  column: [
    { id: 'round', name: 'Круглая', form: 'ellipse' },
    { id: 'square', name: 'Квадратная', form: 'rect' },
  ],
}
export function withForm<T extends Shape>(s: T, id: string): T {
  const preset = shapePresets.find((p) => p.id === id)!
  return { ...s, shape: preset.shape, points: preset.points ? structuredClone(preset.points) : [] }
}
export function withVariant(s: HallObject, id: NonNullable<HallObject['variant']>): HallObject {
  const v = variants[s.kind]?.find((v) => v.id === id)
  return { ...(v ? withForm(s, v.form) : s), variant: id }
}
