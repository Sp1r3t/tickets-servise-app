import { ScanLine } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { post } from '../api'
import { Notice } from '../components/ui'
import { errorText } from '../constants'

export function CheckIn() {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  async function scan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setBusy(true)
    setMessage('')
    try {
      const result = await post<{ item: { row: string; number: string; section: string } }>(
        '/tickets/scan',
        { code: data.get('code') },
      )
      setMessage(
        `Вход разрешён · ${result.item.section}, ряд ${result.item.row}, место ${result.item.number}`,
      )
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">КОНТРОЛЬ ВХОДА</div>
          <h1>Проверка билета</h1>
          <p className="muted">Каждый билет можно использовать только один раз.</p>
        </div>
      </div>
      <form className="panel form-panel narrow" onSubmit={scan}>
        <ScanLine size={32} />
        <h3>Код с электронного билета</h3>
        <p className="muted small">
          Вставьте текст QR-кода или код, скопированный из кабинета покупателя. Камера будет
          подключена на следующем этапе.
        </p>
        <label>
          Код билета
          <textarea name="code" rows={4} required />
        </label>
        <Notice message={message} />
        <button className="button primary" disabled={busy}>
          {busy ? 'Проверка…' : 'Проверить и отметить вход'}
        </button>
      </form>
    </>
  )
}
