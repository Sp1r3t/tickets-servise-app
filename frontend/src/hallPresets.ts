import { emptyLayout, newId, type Layout, type Seat } from './types'

/** Editable examples inspired by hall types, not copies of third-party seating plans. */
export function hallPreset(kind: 'theatre' | 'club' | 'arena'): Layout {
  const layout = emptyLayout()
  layout.width = 1600
  layout.height = 1100
  layout.stage = {
    x: 600,
    y: 60,
    width: 400,
    height: 100,
    label: 'СЦЕНА',
    shape: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.65 },
      { x: 0.85, y: 1 },
      { x: 0.15, y: 1 },
      { x: 0, y: 0.65 },
    ],
  }
  layout.levels = [{ id: 'ground', name: 'Партер' }]
  layout.objects = []
  const category = layout.categories[0].id,
    premium = layout.categories[1].id
  function seat(
    x: number,
    y: number,
    row: string,
    number: number,
    section: string,
    level = 'ground',
    rotation = 0,
    categoryId = category,
  ): Seat {
    return {
      id: newId(),
      x,
      y,
      row,
      number: String(number),
      section,
      level_id: level,
      rotation,
      category_id: categoryId,
      blocked: false,
      accessible: false,
    }
  }
  if (kind === 'theatre') {
    layout.levels.push({ id: 'balcony-1', name: 'Балкон 1' }, { id: 'balcony-2', name: 'Балкон 2' })
    for (const [level, start, count] of [
      ['ground', 240, 10],
      ['balcony-1', 420, 5],
      ['balcony-2', 600, 5],
    ] as const) {
      for (let r = 0; r < count; r++) {
        const radius = start + r * 44,
          n = Math.floor((radius * 1.65) / 34)
        for (let i = 0; i < n; i++) {
          const angle = -0.88 + (i * 1.76) / (n - 1)
          layout.seats.push(
            seat(
              800 + Math.sin(angle) * radius,
              195 + Math.cos(angle) * radius,
              String(r + 1),
              i + 1,
              level === 'ground' ? 'Амфитеатр' : 'Балкон',
              level,
              (-angle * 180) / Math.PI,
              r < 2 ? premium : category,
            ),
          )
        }
      }
      layout.objects.push({
        id: newId(),
        kind: 'zone',
        label: level === 'ground' ? 'Амфитеатр' : `Уровень ${level.endsWith('1') ? '1' : '2'}`,
        x: 650,
        y: 230,
        width: 300,
        height: 40,
        color: '#f0edfb',
        blocks_seats: false,
        level_id: level,
      })
    }
    layout.seats[0].accessible = true
  } else if (kind === 'club') {
    layout.stage = {
      ...layout.stage,
      x: 1090,
      y: 360,
      width: 360,
      height: 250,
      points: [
        { x: 0.3, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0.4 },
      ],
    }
    layout.objects.push(
      {
        id: newId(),
        kind: 'zone',
        label: 'ТАНЦПОЛ',
        x: 500,
        y: 300,
        width: 500,
        height: 550,
        shape: 'ellipse',
        color: '#efedfa',
        blocks_seats: false,
      },
      {
        id: newId(),
        kind: 'bar',
        label: 'БАР',
        x: 100,
        y: 80,
        width: 340,
        height: 90,
        color: '#e5d8f4',
        blocks_seats: true,
      },
      {
        id: newId(),
        kind: 'stairs',
        label: 'Лестница',
        x: 1300,
        y: 850,
        width: 180,
        height: 100,
        color: '#dce5ef',
        blocks_seats: true,
      },
    )
    layout.levels.push({ id: 'vip-balcony', name: 'VIP-балкон' })
    for (let t = 0; t < 8; t++) {
      const angle = -1.15 + (t * 2.3) / 7,
        x = 770 - Math.cos(angle) * 490,
        y = 555 + Math.sin(angle) * 450
      layout.objects.push({
        id: newId(),
        kind: 'table',
        label: `Стол ${t + 1}`,
        x: x - 28,
        y: y - 28,
        width: 56,
        height: 56,
        shape: 'ellipse',
        color: '#e2d9f7',
        blocks_seats: true,
        level_id: 'vip-balcony',
      })
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        layout.seats.push(
          seat(
            x + Math.cos(a) * 50,
            y + Math.sin(a) * 50,
            String(t + 1),
            i + 1,
            'VIP-столы',
            'vip-balcony',
            (a * 180) / Math.PI,
            premium,
          ),
        )
      }
    }
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 10; c++)
        layout.seats.push(seat(560 + c * 34, 350 + r * 42, String(r + 1), c + 1, 'Партер'))
  } else {
    layout.stage = {
      ...layout.stage,
      x: 600,
      y: 740,
      width: 400,
      height: 100,
      shape: 'rect',
      points: [],
    }
    layout.objects.push({
      id: newId(),
      kind: 'zone',
      label: 'ЦЕНТРАЛЬНЫЙ ПАРТЕР',
      x: 440,
      y: 330,
      width: 720,
      height: 330,
      color: '#f0edfb',
      blocks_seats: false,
    })
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 34; c++)
        layout.seats.push(
          seat(245 + c * 34, 80 + r * 34, String(r + 1), c + 1, 'Северная трибуна', 'ground', 180),
        )
    for (let side = 0; side < 2; side++)
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 18; c++)
          layout.seats.push(
            seat(
              side ? 1420 - r * 34 : 180 + r * 34,
              360 + c * 34,
              String(r + 1),
              c + 1,
              side ? 'Правая трибуна' : 'Левая трибуна',
              'ground',
              side ? 90 : -90,
            ),
          )
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 16; c++)
        layout.seats.push(
          seat(
            545 + c * 34,
            360 + r * 42,
            String(r + 1),
            c + 1,
            'Центральный партер',
            'ground',
            0,
            premium,
          ),
        )
  }
  return layout
}
