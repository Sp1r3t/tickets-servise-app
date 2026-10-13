import { test, expect } from '@playwright/test'
import { hallPreset, presetCatalog } from '../src/hallPresets'

test('all hall bases pass server geometry validation; contextual objects and live rows can be edited', async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const response = await page.request.post('/api/v1/auth/register', {
    data: {
      name: 'Тест интерфейса',
      email: `interface-${suffix}-one@example.com`,
      password: 'EditorPassword123!',
      role: 'organizer',
    },
  })
  expect(response.status()).toBe(201)
  const auth = await response.json()
  for (const preset of presetCatalog) {
    const result = await page.request.post('/api/v1/halls', {
      headers: { Authorization: `Bearer ${auth.access_token}` },
      data: { name: `${preset.name} ${suffix}`, layout: hallPreset(preset.id) },
    })
    expect(result.status(), `${preset.name}: ${await result.text()}`).toBe(201)
  }
  await page.goto('/organizer/halls')
  await page.getByRole('button', { name: 'Создать зал', exact: true }).click()
  await expect(page.locator('.inspector input')).toHaveCount(0)
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await page.getByLabel('Рядов', { exact: true }).fill('1')
  await page.getByLabel('Мест в ряду', { exact: true }).fill('8')
  await page.getByRole('button', { name: 'Добавить блок рядов', exact: true }).click()
  const before = await page
    .locator('.editor-svg g[role=button] > circle')
    .first()
    .getAttribute('cy')
  const handle = page.getByRole('button', { name: 'Потянуть изгиб ряда', exact: true })
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByLabel('Изгиб ряда', { exact: true })).not.toHaveValue('0')
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click()
  await expect(page.getByLabel('Изгиб ряда', { exact: true })).toHaveValue('0')
  expect(await page.locator('.editor-svg g[role=button] > circle').first().getAttribute('cy')).toBe(
    before,
  )
  await page.locator('.tool-library').getByText('Объекты и зоны', { exact: true }).click()
  await page.getByRole('button', { name: 'Добавить: Бар', exact: true }).click()
  await page.getByRole('button', { name: 'Вариант: Угловой', exact: true }).click()
  await expect(page.locator('.editor-svg [data-object-kind=bar]')).toHaveAttribute(
    'data-variant',
    'corner',
  )
  await page.locator('.inspector').getByLabel('Надпись', { exact: true }).fill('Коктейльный бар')
  await expect(
    page.locator('.editor-svg text').filter({ hasText: /^Коктейльный бар$/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Добавить: Стол', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить 4 места вокруг стола', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить зал', exact: true }).click()
  await expect(page.getByText('Схема сохранена на сервере.', { exact: false })).toBeVisible()
  await page.locator('.editor-svg').press('Escape')
  await expect(page.locator('.inspector input')).toHaveCount(0)
})
