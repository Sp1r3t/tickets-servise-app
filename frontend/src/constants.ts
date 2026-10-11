export const labels: Record<string, string> = {
  draft: 'Черновик',
  publishing: 'Публикуется',
  published: 'В продаже',
  creating: 'Создаётся',
  cancelling: 'Отмена брони',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  expired: 'Бронь истекла',
  failed: 'Места недоступны',
  cancelled: 'Отменён',
  refunded: 'Тестовый платёж возвращён',
}
export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Произошла ошибка')
