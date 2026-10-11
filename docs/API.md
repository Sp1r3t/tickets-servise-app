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
| GET/POST | /organizer/events | Собственные концерты / черновик |
| PUT | /organizer/events/{id} | Изменить только draft |
| POST | /organizer/events/{id}/publish | Идемпотентная публикация снимка |
| GET | /events | Публичный список, limit 1–100, offset >= 0 |
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

Layout: width/height, stage, categories, seats. Категория содержит id/name/color/price. Место — стабильный id, x/y, section/row/number, category_id, accessible/blocked. Уникальны ID и комбинация section/row/number. Места не пересекаются и не выходят за пределы; stage проверяется аналогично. До 5000 мест, 20 категорий, 8 мест на заказ. Нет входных зон в текущем контракте.

Создание заказа может вернуть состояние `failed` при конфликте места: намерение заказа уже сохранено, поэтому тот же idempotency key возвращает тот же результат. Клиент показывает ошибку, обновляет остатки и создаёт **новый** ключ для новой попытки. 503/потерянный ответ повторяются **с прежним** ключом.

401 — нет корректной сессии; 403 — недостаточно прав; 404 — отсутствующий/чужой объект; 409 — конфликт состояния/ревизии/idempotency; 422 — неверные поля; 429 — лимит; 503 — временная ошибка зависимости. FastAPI validation detail — массив, business detail — строка. Ответы содержат X-Request-ID. Полной сквозной distributed tracing пока нет.

`/internal/*` — сервисный API, требует X-Internal-Key, не открыт через gateway. OpenAPI каждого сервиса доступна по `/docs` его локального порта; объединённая спецификация и генератор клиентских SDK — следующие задачи.
