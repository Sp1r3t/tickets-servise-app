import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h2>Не удалось открыть страницу</h2>
        <p>Ваши данные на сервере сохранены.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Перезагрузить
        </button>
      </div>
    ) : (
      this.props.children
    )
  }
}

export function Notice({ message }: { message: string }) {
  return message ? (
    <div className="notice" role="status">
      {message}
    </div>
  ) : null
}

export function Loading() {
  return <div className="empty muted">Загрузка…</div>
}
