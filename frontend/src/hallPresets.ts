import { emptyLayout, newId, type Layout, type Seat } from './types'

export const presetCatalog = [
  { id: 'theatre', name: 'Театр с балконами', description: 'Изогнутые ряды · три уровня' },
  { id: 'club', name: 'Клуб и VIP-столы', description: 'Свободный танцпол · бар · балкон' },
  { id: 'arena', name: 'Арена с трибунами', description: 'Трибуны вокруг центрального партера' },
  { id: 'cinema', name: 'Кинозал', description: 'Прямые ряды · центральный проход' },
  { id: 'jazz', name: 'Джаз-клуб', description: 'Камерная сцена · круглые столы' },
  { id: 'banquet', name: 'Банкетный зал', description: 'Столы на шесть мест · большой зал' },
  { id: 'runway', name: 'Сцена-подиум', description: 'Зрители по обе стороны сцены' },
  { id: 'amphitheater', name: 'Открытый амфитеатр', description: 'Радиальные ряды · один уровень' },
] as const
export type PresetKind = (typeof presetCatalog)[number]['id']

/** Editable examples inspired by hall types, not copies of third-party seating plans. */
export function hallPreset(kind: PresetKind): Layout {
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
  if (kind === 'theatre' || kind === 'amphitheater') {
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
  } else if (kind === 'club' || kind === 'jazz' || kind === 'banquet') {
    const club = kind === 'club'
    if (club) {
      layout.objects.push(
        {
          id: newId(),
          kind: 'zone',
          label: 'ТАНЦПОЛ',
          x: 460,
          y: 250,
          width: 680,
          height: 530,
          shape: 'rect',
          color: '#f1edfc',
          blocks_seats: false,
        },
        {
          id: newId(),
          kind: 'bar',
          variant: 'straight',
          label: 'БАР',
          x: 90,
          y: 300,
          width: 100,
          height: 480,
          color: '#e6d8ed',
          blocks_seats: true,
          rotation: 0,
        },
        {
          id: newId(),
          kind: 'stairs',
          variant: 'double',
          label: 'НА БАЛКОН',
          x: 1330,
          y: 870,
          width: 150,
          height: 140,
          color: '#dce5ef',
          blocks_seats: true,
        },
        {
          id: newId(),
          kind: 'entrance',
          variant: 'double',
          label: 'ВХОД',
          x: 100,
          y: 910,
          width: 160,
          height: 110,
          color: '#dceee5',
          blocks_seats: false,
        },
      )
    }
    let tableNumber = 0
    function table(x: number, y: number, level = 'ground', count = 4) {
      const t = ++tableNumber,
        size = count === 6 ? 76 : 60,
        radius = count === 6 ? 72 : 58
      layout.objects!.push({
        id: newId(),
        kind: 'table',
        variant: 'round',
        label: `СТОЛ ${t}`,
        x: x - size / 2,
        y: y - size / 2,
        width: size,
        height: size,
        shape: 'ellipse',
        color: '#eadfce',
        blocks_seats: true,
        level_id: level,
      })
      for (let i = 0; i < count; i++) {
        const a = (i * Math.PI * 2) / count
        layout.seats.push(
          seat(
            x + Math.cos(a) * radius,
            y + Math.sin(a) * radius,
            String(t),
            i + 1,
            'Столы',
            level,
            (a * 180) / Math.PI - 90,
            premium,
          ),
        )
      }
    }
    if (club) {
      for (const x of [330, 1270]) for (const y of [320, 530, 740]) table(x, y)
      for (const x of [560, 800, 1040]) table(x, 930)
      layout.levels.push({ id: 'vip-balcony', name: 'VIP-балкон' })
      layout.objects.push({
        id: newId(),
        kind: 'zone',
        label: 'VIP-БАЛКОН · ВИД НА СЦЕНУ',
        x: 400,
        y: 400,
        width: 800,
        height: 70,
        color: '#eee8f8',
        blocks_seats: false,
        level_id: 'vip-balcony',
      })
      for (const x of [380, 590, 800, 1010, 1220]) table(x, 550, 'vip-balcony')
      for (const x of [330, 1270]) for (const y of [740, 930]) table(x, y, 'vip-balcony')
    } else {
      for (let r = 0; r < (kind === 'banquet' ? 4 : 3); r++)
        for (let c = 0; c < 4; c++) table(350 + c * 300, 300 + r * 225, 'ground', 6)
      layout.objects.push({
        id: newId(),
        kind: 'bar',
        variant: 'straight',
        label: 'БАР',
        x: 110,
        y: 300,
        width: 90,
        height: 470,
        color: '#e6d8ed',
        blocks_seats: true,
      })
    }
  } else if (kind === 'cinema') {
    layout.stage = {
      ...layout.stage,
      label: 'СЦЕНА / ЭКРАН',
      x: 350,
      width: 900,
      shape: 'rect',
      points: [],
    }
    for (let r = 0; r < 12; r++)
      for (let side = 0; side < 2; side++)
        for (let c = 0; c < 12; c++)
          layout.seats.push(
            seat(
              350 + side * 500 + c * 34,
              280 + r * 42,
              String(r + 1),
              side * 12 + c + 1,
              'Партер',
            ),
          )
    layout.objects.push({
      id: newId(),
      kind: 'entrance',
      variant: 'double',
      label: 'ВЫХОД',
      x: 1240,
      y: 890,
      width: 160,
      height: 110,
      color: '#dceee5',
      blocks_seats: false,
    })
  } else if (kind === 'runway') {
    layout.stage = { x: 750, y: 170, width: 100, height: 650, label: 'ПОДИУМ', shape: 'rect' }
    for (let side = 0; side < 2; side++)
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 16; c++)
          layout.seats.push(
            seat(
              side ? 970 + r * 42 : 630 - r * 42,
              230 + c * 34,
              String(r + 1),
              c + 1,
              side ? 'Правая сторона' : 'Левая сторона',
              'ground',
              side ? 90 : -90,
            ),
          )
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
  if (kind === 'amphitheater') {
    layout.levels = [{ id: 'ground', name: 'Партер' }]
    layout.seats = layout.seats.filter((s) => s.level_id === 'ground')
    layout.objects = layout.objects.filter((o) => !o.level_id || o.level_id === 'ground')
  }
  return layout
}
