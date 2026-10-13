# Основные контракты API v1

Внешний prefix — `/api/v1`. JSON, суммы в копейках RUB, даты ISO 8601 с timezone, IDs непрозрачные. `Authorization: Bearer <access_token>` нужен для кабинетов и операций покупки. Refresh браузера — HttpOnly cookie с path `/api/v1/auth`.

| Метод | Маршрут | Назначение |
|---|---|---|
| POST | /auth/register | email, name, password (10–128), role buyer/organizer |
| POST | /auth/login | email/password; access + профиль, refresh cookie |
| POST | /auth/refresh | Однократная ротация refresh cookie |
| POST | /auth/logout | Отзыв текущей refresh-сессии |
| GET | /auth/me | Собственный профиль |
| GET/POST | /halls | Собственные шаблоны / создание |
| PUT | /halls/{id} | name, layout, ожидаемая revision |
| GET | /organizer/library | Только организатор: search, limit 1–100, offset; venues с вариантами, has_more |
| GET | /organizer/library/{template_id} | Публичный снимок схемы + имя автора и площадка; только организатор |
| POST | /organizer/library/{template_id}/copy | Новая собственная схема, revision=1, venue_info и атрибуция источника |
| GET/POST | /organizer/events | Собственные концерты / черновик |
| PUT | /organizer/events/{id} | Изменить только draft |
| POST | /organizer/events/{id}/publish | Идемпотентная публикация снимка |
| GET | /events | Публичный список, min_price; limit 1–100, offset >= 0, city/search/genre |
| GET | /widgets/{slug} | Публичные условия концерта + снимок схемы |
| GET | /inventory/{event_id} | state/price каждого места, server_time и sales_open |
| POST | /orders | event_id + seat_ids; обязательный Idempotency-Key 8–128 |
| GET | /orders | Собственные заказы, limit/offset |
| GET | /orders/{id} | Заказ и билеты; повторяет незавершённые шаги |
| POST | /orders/{id}/checkout | Создать/вернуть один платёж для pending |
| POST | /orders/{id}/cancel | Отменить неоплаченную бронь |
| POST | /payments/{id}/confirm | Подтвердить **демонстрационный** платёж владельца |
| GET | /organizer/events/{id}/sales | sold, pending, revenue (копейки), checked_in |
| POST | /tickets/scan | Подписанный code; только владелец концерта, однократно |

Layout: width/height, stage, categories, seats; необязательные levels и objects. Категория содержит id/name/color/price. Место — стабильный id, x/y, section/row/number, category_id, accessible/blocked; level_id (по умолчанию ground) и rotation. Уникальны ID места и комбинация level_id/section/row/number. Уровень — id/name; старые схемы имеют один ground/Партер.

Stage и HallObject имеют x/y/width/height/label, shape (rect/ellipse/polygon), rotation и level_id. points для polygon — 3–64 пары x/y в диапазоне 0–1 относительно габаритов объекта; для rect/ellipse список пуст. Объект дополнительно содержит id, kind, color и blocks_seats. Виды: zone/table/bar/column/stairs/entrance/technical/decoration. Места не пересекаются с блокирующими объектами или сценой на том же уровне. Контуры не пересекают себя и не выходят за границы, в том числе после поворота. До 5000 мест, 20 категорий, 12 уровней, 200 объектов, 8 мест на заказ. Зоны и столы являются схемными объектами; продажа квот/целых столов отсутствует.

EventInput дополнен genre: live/rock/pop/electronic/jazz/classical/other, по умолчанию live. POST публикации автоматически добавляет снимок в библиотеку; частные черновики туда не входят. Список библиотечных вариантов содержит id/name/author/seat_count/level_count/created_at; полная layout загружается отдельным GET. На одной площадке может быть несколько схем. Пагинация библиотеки выполняется по вариантам; одна площадка с множеством вариантов может продолжаться на следующей странице.

Создание заказа может вернуть состояние `failed` при конфликте места: намерение заказа уже сохранено, поэтому тот же idempotency key возвращает тот же результат. Клиент показывает ошибку, обновляет остатки и создаёт **новый** ключ для новой попытки. 503/потерянный ответ повторяются **с прежним** ключом.

401 — нет корректной сессии; 403 — недостаточно прав; 404 — отсутствующий/чужой объект; 409 — конфликт состояния/ревизии/idempotency; 422 — неверные поля; 429 — лимит; 503 — временная ошибка зависимости. FastAPI validation detail — массив, business detail — строка. Ответы содержат X-Request-ID. Полной сквозной distributed tracing пока нет.

`/internal/*` — сервисный API, требует X-Internal-Key, не открыт через gateway. OpenAPI каждого сервиса доступна по `/docs` его локального порта; объединённая спецификация и генератор клиентских SDK — следующие задачи.


Объект поддерживает необязательный `variant`: plain (прежнее оформление), straight, corner, double, spiral, island, round, square, long. Это оформление, не квота и не новый продаваемый объект. Геометрия препятствия определяется `shape/points/rotation`; выбор варианта в редакторе одновременно устанавливает подходящий контур. Значение plain исключается из fingerprint для совместимости повторов прежних публикаций.

Shape имеет необязательный `appearance` (null для прежнего формата). Поля: pattern = auto/none/diagonal/cross/dots/horizontal/vertical; pattern_color (hex), pattern_spacing (4–80), pattern_angle (−180…180), pattern_width (0.25–5); outline_color (hex), outline_width (0–6); label_color (hex), label_size (6–40); label_visible/icon_visible/details_visible (bool); label_position/icon_position (null или `{x,y}` в диапазоне 0–1). Позиции задаются в локальной системе фигуры и масштабируются вместе с ней. Слой оформления не заменяет shape/points/rotation, геометрия препятствия остаётся прежней.

Новые kind объектов: sofa (диван), bench (скамья), exit, wc, cloakroom, lift, sound, light, fence, plant. Это совместимое расширение JSON-контракта; стол/диван/танцпол сами по себе не являются билетами. Внешний клиент должен уметь отобразить неизвестный kind как фигуру с подписью. Отсутствующий appearance удаляется при нормализации fingerprint Inventory.
