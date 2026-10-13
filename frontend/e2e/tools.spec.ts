import { test, expect, type Page, type Locator } from '@playwright/test'

async function world(page: Page, x: number, y: number) {
  const canvas = page.locator('.editor-svg')
  await canvas.scrollIntoViewIfNeeded()
  return canvas.evaluate(
    (svg, p) => {
      const v = new DOMPoint(p.x, p.y).matrixTransform((svg as SVGSVGElement).getScreenCTM()!)
      return { x: v.x, y: v.y }
    },
    { x, y },
  )
}
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  await target.scrollIntoViewIfNeeded()
  const box = (await target.boundingBox())!,
    start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const scale = await page
    .locator('.editor-svg')
    .evaluate((svg) => (svg as SVGSVGElement).getScreenCTM()!.a)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx * scale, start.y + dy * scale, { steps: 8 })
  await page.mouse.up()
}
async function bodyPoint(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  return target.evaluate((g) => {
    const p = new DOMPoint(18, 18).matrixTransform((g as SVGGElement).getScreenCTM()!)
    return { x: p.x, y: p.y }
  })
}

test('furniture, custom nodes, transform handles, decoration and context operations persist', async ({
  page,
}) => {
  const viewport = page.viewportSize()!
  if (viewport.width > 800) await page.setViewportSize({ ...viewport, height: 1100 })
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const account = await page.request.post('/api/v1/auth/register', {
    data: {
      name: 'Тест интерфейса',
      email: `interface-${suffix}-one@example.com`,
      password: 'ToolsPassword123!',
      role: 'organizer',
    },
  })
  expect(account.status()).toBe(201)
  await page.goto('/organizer/halls')
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: 'Создать зал', exact: true }).click()
  await page.getByLabel('Название зала', { exact: true }).fill(`Инструменты ${suffix}`)
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await page.locator('.tool-library').getByText('Объекты и зоны', { exact: true }).click()
  for (const name of [
    'Диван',
    'Скамья',
    'Выход',
    'Туалет',
    'Гардероб',
    'Лифт',
    'Звук / пульт',
    'Освещение',
    'Ограждение',
    'Растение',
  ])
    await expect(
      page.getByRole('button', { name: `Добавить: ${name}`, exact: true }),
    ).toBeAttached()
  await page.getByRole('button', { name: 'Добавить: Диван', exact: true }).click()
  await page.getByRole('button', { name: 'Нарисовать свой контур', exact: true }).click()
  await expect(page.locator('.contour-toolbar')).toBeVisible()
  for (const [x, y] of [
    [80, 260],
    [260, 260],
    [260, 360],
  ]) {
    const p = await world(page, x, y)
    await page.mouse.click(p.x, p.y)
  }
  await page.locator('.editor-svg').press('Control+z')
  await expect(page.locator('.contour-toolbar')).toContainText('2/64')
  await page.locator('.editor-svg').press('Control+Shift+z')
  await expect(page.locator('.contour-toolbar')).toContainText('3/64')
  const p = await world(page, 80, 360)
  await page.mouse.click(p.x, p.y)
  await page.getByRole('button', { name: 'Завершить контур', exact: true }).click()
  const sofa = page.locator('.editor-svg [data-object-kind=sofa]'),
    sofaId = await sofa.getAttribute('data-object-id')
  await expect(sofa.locator('[data-vertex]')).toHaveCount(4)
  const beforeNode = (await sofa.getAttribute('transform'))!
  await drag(page, sofa.getByRole('button', { name: 'Узел 2', exact: true }), 40, -40)
  await expect(sofa).toHaveAttribute('transform', /^translate\(80 220\)/)
  await page.locator('.editor-svg').press('Control+z')
  await expect(sofa).toHaveAttribute('transform', beforeNode)
  await page.locator('.editor-svg').press('Control+Shift+z')
  await expect(sofa).toHaveAttribute('transform', /^translate\(80 220\)/)
  await drag(
    page,
    sofa.getByRole('button', { name: 'Размер: нижний правый угол', exact: true }),
    40,
    20,
  )
  await page.getByRole('button', { name: 'Добавить узел после 1', exact: true }).click()
  await expect(sofa.locator('[data-vertex]')).toHaveCount(5)
  await page.locator('.editor-svg').press('Control+z')
  await expect(sofa.locator('[data-vertex]')).toHaveCount(4)
  await page.locator('.inspector').getByText('Штриховка и детали', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Заливка узором', exact: true }).selectOption('cross')
  await page.getByLabel('Шаг штриховки', { exact: true }).fill('8')
  await page.getByLabel('Угол штриховки', { exact: true }).fill('30')
  await drag(page, sofa.getByRole('button', { name: 'Переместить значок', exact: true }), -35, 0)
  await drag(page, sofa.getByRole('button', { name: 'Переместить подпись', exact: true }), 20, 10)
  await page.locator('.inspector').getByText('Размер и положение', { exact: true }).click()
  await page.getByLabel('Поворот, °', { exact: true }).fill('45')
  await page.getByRole('button', { name: 'Привязка к сетке', exact: true }).click()
  await drag(
    page,
    sofa.getByRole('button', { name: 'Размер: правый край', exact: true }),
    20 * Math.SQRT1_2,
    20 * Math.SQRT1_2,
  )
  await page.keyboard.down('Shift')
  await drag(
    page,
    sofa.getByRole('button', { name: 'Размер: верхний левый угол', exact: true }),
    -12 * Math.SQRT1_2,
    -44 * Math.SQRT1_2,
  )
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Добавить: Бар', exact: true }).click()
  await page.getByRole('button', { name: 'Вариант: П-образный', exact: true }).click()
  const bar = page.locator('.editor-svg [data-object-kind=bar]').first(),
    barId = (await bar.getAttribute('data-object-id'))!
  await expect(bar.locator('[data-clipped-content=true]')).toHaveAttribute('clip-path', /^url\(/)
  let bp = await bodyPoint(bar)
  await page.mouse.click(bp.x, bp.y, { button: 'right' })
  await expect(page.getByRole('menuitem')).toHaveCount(8)
  await page.getByRole('menuitem', { name: 'Скопировать', exact: false }).click()
  const pastePoint = await world(page, 700, 450)
  await page.mouse.click(pastePoint.x, pastePoint.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Вставить', exact: false }).click()
  const bars = page.locator('.editor-svg [data-object-kind=bar]')
  await expect(bars).toHaveCount(2)
  const copyId = await bars.nth(1).getAttribute('data-object-id')
  expect(copyId).not.toBe(barId)
  bp = await bodyPoint(bar)
  await page.keyboard.down('Shift')
  await page.mouse.click(bp.x, bp.y)
  await page.keyboard.up('Shift')
  await expect(page.getByRole('heading', { name: 'Объекты · 2', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Центр по вертикали', exact: true }).click()
  const centers = await bars.evaluateAll((gs) =>
    gs.map((g) => {
      const box = (g as SVGGElement).getBBox(),
        p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(
          (g as SVGGElement).getCTM()!,
        )
      return p.y
    }),
  )
  expect(Math.abs(centers[0] - centers[1])).toBeLessThan(1)
  await page.locator('.editor-svg').press('Control+d')
  await expect(bars).toHaveCount(4)
  await page.locator('.editor-svg').press('Delete')
  await expect(bars).toHaveCount(2)
  await page.locator('.editor-svg').press('Control+z')
  await expect(bars).toHaveCount(4)
  bp = await bodyPoint(bars.nth(2))
  await page.mouse.click(bp.x, bp.y)
  const fourth = await bodyPoint(bars.nth(3))
  await page.keyboard.down('Shift')
  await page.mouse.click(fourth.x, fourth.y)
  await page.keyboard.up('Shift')
  bp = await bodyPoint(bars.nth(2))
  await page.mouse.click(bp.x, bp.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Вырезать', exact: false }).click()
  await expect(bars).toHaveCount(2)
  await page.locator('.editor-svg').press('Control+v')
  await expect(bars).toHaveCount(4)
  bp = await bodyPoint(bars.nth(2))
  await page.mouse.click(bp.x, bp.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'На передний план', exact: true }).click()
  const save = page.waitForRequest(
    (r) => r.url().endsWith('/api/v1/halls') && r.method() === 'POST',
  )
  await page.getByRole('button', { name: 'Сохранить зал', exact: true }).click()
  const layout = (await save).postDataJSON().layout
  const saved = layout.objects.find((o: { id: string }) => o.id === sofaId)
  expect(saved.width).toBeCloseTo(308, 1)
  expect(saved.height).toBeCloseTo(176, 1)
  expect(saved.rotation).toBe(45)
  expect(saved.points).toHaveLength(4)
  expect(saved.appearance.pattern).toBe('cross')
  expect(saved.appearance.pattern_spacing).toBe(8)
  expect(saved.appearance.icon_position).not.toBeNull()
  expect(saved.appearance.label_position).not.toBeNull()
  expect(new Set(layout.objects.map((o: { id: string }) => o.id)).size).toBe(layout.objects.length)
  await expect(page.getByText('Схема сохранена на сервере.', { exact: false })).toBeVisible()
  expect(errors).toEqual([])
})
