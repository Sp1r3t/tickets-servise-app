export type User = { id: string; email: string; name: string; role: 'buyer' | 'organizer' }
export type Category = { id: string; name: string; color: string; price: number }
export type Seat = {
  id: string
  x: number
  y: number
  row: string
  number: string
  section: string
  category_id: string
  accessible: boolean
  blocked: boolean
}
export type Layout = {
  width: number
  height: number
  stage: { x: number; y: number; width: number; height: number; label: string }
  categories: Category[]
  seats: Seat[]
}
export type Hall = { id: string; name: string; revision: number; layout: Layout }
export type EventDetails = {
  title: string
  artist: string
  description: string
  starts_at: string
  doors_at: string
  timezone: string
  city: string
  venue: string
  address: string
  age_limit: number
  poster_url: string | null
  organizer_name: string
  contact_email: string
  refund_policy: string
  hall_id: string
}
export type Concert = {
  id: string
  slug: string
  status?: string
  details: EventDetails
  layout?: Layout
}
export type Item = {
  seat_id: string
  price: number
  section: string
  row: string
  number: string
  category: string
  accessible: boolean
}
export type Ticket = { id: string; item: Item; code: string; checked_in_at: number | null }
export type Order = {
  id: string
  event_id: string
  state: string
  items: Item[]
  amount: number
  expires_at: number
  server_time: number
  event_snapshot: EventDetails
  tickets: Ticket[]
}
export type Stock = {
  event_id: string
  server_time: number
  sales_open: boolean
  seats: { id: string; state: string; price: number }[]
}
export const money = (amount: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount / 100)
export const date = (value: string, timezone = 'Europe/Moscow') =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value))
export const newId = () => crypto.randomUUID()
export function rowMarkers(seats: Seat[]) {
  const rows = new Map<string, Seat>()
  for (const seat of seats) {
    const key = `${seat.section}|${seat.row}`
    const left = rows.get(key)
    if (!left || seat.x < left.x) rows.set(key, seat)
  }
  return [...rows.entries()].map(([key, seat]) => ({ key, ...seat }))
}
export function emptyLayout(): Layout {
  return {
    width: 1000,
    height: 700,
    stage: { x: 300, y: 45, width: 400, height: 75, label: 'СЦЕНА' },
    categories: [
      { id: newId(), name: 'Стандарт', color: '#6960e8', price: 250000 },
      { id: newId(), name: 'Премиум', color: '#e6a344', price: 450000 },
    ],
    seats: [],
  }
}
