import { test, expect } from '@playwright/test'

test('organizer draws a hall, publishes concert; buyer reserves, pays and receives QR', async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const sellerEmail = `seller-${suffix}@example.com`,
    buyerEmail = `buyer-${suffix}@example.com`
  const title = `Концерт ${suffix}`
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/login?mode=register&role=organizer')
  await page.getByLabel('Имя', { exact: true }).fill('Организатор теста')
  await page.getByLabel('Email', { exact: true }).fill(sellerEmail)
  await page.getByLabel('Пароль', { exact: true }).fill('BrowserTestPassword123!')
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await expect(page.getByRole('heading', { name: 'Ваши концерты' })).toBeVisible()
  await page.goto('/organizer/halls')
  await page.getByRole('button', { name: 'Создать зал' }).click()
  await page.getByLabel('Название зала', { exact: true }).fill(`Зал ${suffix}`)
  await page.getByLabel('Рядов', { exact: true }).fill('3')
  await page.getByLabel('Мест в ряду', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Добавить блок рядов' }).click()
  await expect(page.getByText('18 мест', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить зал' }).click()
  await expect(page.getByText('Схема сохранена на сервере.', { exact: false })).toBeVisible()
  await page.goto('/organizer/events/new')
  await page.getByLabel('Название', { exact: true }).fill(title)
  await page.getByLabel('Артист / состав').fill('Тестовая группа')
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Полная программа тестового концерта для проверки продажи билетов.')
  await page.getByLabel('Город', { exact: true }).fill('Москва')
  await page.getByLabel('Площадка', { exact: true }).fill('Тестовая площадка')
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тестовая улица, 10')
  await page
    .getByLabel('Условия возврата', { exact: true })
    .fill('Для возврата обратитесь к организатору по указанному email.')
  await page.getByRole('button', { name: 'Сохранить черновик' }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click()
  await expect(page.locator('.event-row .badge.green')).toBeVisible()
  const widgetLink = await page.getByRole('link', { name: 'Открыть виджет' }).getAttribute('href')
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await page.goto('/login?mode=register')
  await page.getByLabel('Имя', { exact: true }).fill('Покупатель теста')
  await page.getByLabel('Email', { exact: true }).fill(buyerEmail)
  await page.getByLabel('Пароль', { exact: true }).fill('BrowserTestPassword123!')
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await expect(page.getByRole('heading', { name: 'Афиша.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Начать продажи' })).toHaveCount(0)
  await page.goto(widgetLink!)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy()
  await page
    .getByRole('button', { name: 'Партер, ряд 1, место 1, Стандарт, свободно', exact: true })
    .click()
  await page.getByRole('button', { name: 'Забронировать на 10 минут' }).click()
  await expect(page.getByText('Деньги не списываются', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Оплатить в тестовом режиме' }).click()
  await expect(page.getByRole('heading', { name: 'Билеты у вас!' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR-код билета, ряд 1, место 1' })).toBeVisible()
  await page.getByRole('link', { name: 'Все мои билеты' }).click()
  await expect(page.getByText('Оплачен', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Мои билеты' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR-код билета, ряд 1, место 1' })).toBeVisible()
  expect(errors).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy()
})
