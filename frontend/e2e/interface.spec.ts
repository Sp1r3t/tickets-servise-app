import { test, expect, type Page } from '@playwright/test'

async function register(page: Page, suffix: string, role = 'organizer') {
  await page.goto(`/login?mode=register&role=${role}`)
  await page.getByLabel('Имя', { exact: true }).fill('Тест интерфейса')
  await page.getByLabel('Email', { exact: true }).fill(`interface-${suffix}@example.com`)
  await page.getByLabel('Пароль', { exact: true }).fill('InterfacePassword123!')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: role === 'organizer' ? 'Ваши концерты' : 'Афиша.' }),
  ).toBeVisible()
}

test('audience discovery and complex hall library work across organizer accounts', async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const venue = `Площадка ${suffix}`,
    title = `Балконный концерт ${suffix}`
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Зарегистрироваться', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Купить билеты', exact: true })).toHaveCount(0)
  await register(page, `${suffix}-one`)
  await page.goto('/organizer/halls')
  await page.getByRole('button', { name: 'Создать зал', exact: true }).click()
  await page.getByLabel('Название зала', { exact: true }).fill(`Зал ${suffix}`)
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await page.getByRole('button', { name: 'Нарисовать свой контур', exact: true }).click()
  const canvas = page.locator('.editor-svg')
  await canvas.scrollIntoViewIfNeeded()
  const contour = await canvas.evaluate((element) =>
    [
      [300, 45],
      [700, 45],
      [700, 120],
      [580, 120],
      [580, 90],
      [300, 90],
    ].map(([x, y]) => {
      const p = new DOMPoint(x, y).matrixTransform((element as SVGSVGElement).getScreenCTM()!)
      return { x: p.x, y: p.y }
    }),
  )
  for (const point of contour) await page.mouse.click(point.x, point.y)
  await page.getByRole('button', { name: 'Завершить контур', exact: true }).click()
  await page.getByLabel('Рядов', { exact: true }).fill('3')
  await page.getByLabel('Мест в ряду', { exact: true }).fill('8')
  await page.getByRole('button', { name: 'Добавить блок рядов' }).click()
  await page.getByLabel('Изгиб ряда', { exact: true }).fill('24')
  await page.getByLabel('Поворот рядов, °', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Применить к рядам' }).click()
  await page.getByRole('combobox', { name: 'Тип объекта', exact: true }).selectOption('column')
  await page.getByRole('button', { name: 'Добавить объект', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить балкон / ярус' }).click()
  await page.getByLabel('Рядов', { exact: true }).fill('1')
  await page.getByLabel('Мест в ряду', { exact: true }).fill('4')
  await page.getByLabel('Начиная с ряда', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Добавить блок рядов' }).click()
  const saveRequest = page.waitForRequest(
    (request) => request.url().endsWith('/api/v1/halls') && request.method() === 'POST',
  )
  await page.getByRole('button', { name: 'Сохранить зал' }).click()
  const savedLayout = (await saveRequest).postDataJSON().layout
  expect(savedLayout.stage.shape).toBe('polygon')
  expect(savedLayout.stage.points).toHaveLength(6)
  expect(savedLayout.levels).toHaveLength(2)
  expect(savedLayout.objects[0].kind).toBe('column')
  expect(savedLayout.seats.filter((s: { rotation?: number }) => s.rotation)).toHaveLength(24)
  await expect(page.getByText('Схема сохранена на сервере.', { exact: false })).toBeVisible()
  await page.goto('/organizer/events/new')
  await page.getByLabel('Название', { exact: true }).fill(title)
  await page.getByLabel('Артист / состав').fill('Группа со сложным залом')
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Концерт с изогнутыми рядами, колонной и отдельным балконом.')
  await page.getByRole('combobox', { name: 'Жанр', exact: true }).selectOption('rock')
  await page.getByLabel('Город', { exact: true }).fill('Москва')
  await page.getByLabel('Площадка', { exact: true }).fill(venue)
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Библиотечная улица, 12')
  await page
    .getByLabel('Условия возврата', { exact: true })
    .fill('Для возврата обратитесь к организатору по указанному email.')
  await page.getByRole('button', { name: 'Сохранить черновик' }).click()
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Открыть виджет' })).toBeVisible()
  const widget = await page.getByRole('link', { name: 'Открыть виджет' }).getAttribute('href')
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await register(page, `${suffix}-two`)
  await page.goto('/organizer/events/new')
  await page.getByRole('button', { name: 'Выбрать площадку' }).click()
  await page.getByLabel('Поиск площадки', { exact: true }).fill(venue)
  await expect(page.getByRole('button', { name: 'Использовать эту схему' })).toBeEnabled()
  await page.getByRole('button', { name: 'Использовать эту схему' }).click()
  await expect(page.getByLabel('Площадка', { exact: true })).toHaveValue(venue)
  await expect(page.getByLabel('Адрес', { exact: true })).toHaveValue(
    'Москва, Библиотечная улица, 12',
  )
  await page.getByLabel('Название', { exact: true }).fill('Черновик не должен исчезнуть')
  await page.getByRole('button', { name: 'Выбрать площадку' }).click()
  await page.getByLabel('Поиск площадки', { exact: true }).fill(venue)
  await expect(page.getByRole('button', { name: 'Использовать эту схему' })).toBeEnabled()
  await page.getByRole('button', { name: 'Использовать эту схему' }).click()
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue(
    'Черновик не должен исчезнуть',
  )
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await register(page, `${suffix}-buyer`, 'buyer')
  await expect(page.getByRole('link', { name: 'Создать концерт', exact: true })).toHaveCount(0)
  await page.getByLabel('Поиск концертов').fill(suffix)
  await expect(page.locator('.afisha-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Джаз', exact: true }).click()
  await expect(page.getByText('Пока ничего не нашлось', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Рок', exact: true }).click()
  await expect(page.locator('.afisha-card')).toHaveCount(1)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy()
  await page.goto(widget!)
  await page.getByRole('button', { name: 'Балкон 1', exact: true }).click()
  await page
    .getByRole('button', {
      name: 'Балкон 1, Партер, ряд 1, место 1, Стандарт, свободно',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Забронировать на 10 минут' }).click()
  await page.getByRole('button', { name: 'Оплатить в тестовом режиме' }).click()
  await expect(page.getByRole('heading', { name: 'Билеты у вас!' })).toBeVisible()
  await expect(page.getByText('Балкон 1 · Партер', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
