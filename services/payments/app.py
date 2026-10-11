from fastapi import Depends, HTTPException
from pydantic import Field
from sqlalchemy import Column, Integer, MetaData, String, Table, insert, select, update
from sqlalchemy.exc import IntegrityError

from services.common.contracts import StrictModel
from services.common.core import Runtime, base_app, locked, now, one, uid

metadata = MetaData()
payments = Table(
    "payments",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("order_id", String(36), unique=True, nullable=False),
    Column("buyer_id", String(36), nullable=False),
    Column("amount", Integer, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("state", String(20), nullable=False),
    Column("expires_at", Integer, nullable=False),
    Column("created_at", Integer, nullable=False),
)


class PaymentInput(StrictModel):
    order_id: str
    buyer_id: str
    amount: int = Field(gt=0)
    currency: str = Field(pattern="^RUB$")
    expires_at: int


def create_app(settings=None):
    rt = Runtime("payments", metadata, settings)
    app = base_app("payments", rt)
    current_user = rt.user_dependency()

    def view(row):
        return {**row, "provider": "demo", "real_money": False}

    @app.post("/internal/payments", dependencies=[Depends(rt.internal)])
    def create_payment(body: PaymentInput):
        if not rt.settings.demo_payments:
            raise HTTPException(503, "Реальный платёжный провайдер ещё не подключён")

        def existing():
            with rt.engine.connect() as conn:
                old = one(conn, select(payments).where(payments.c.order_id == body.order_id))
                if any(old[k] != getattr(body, k) for k in ("buyer_id", "amount", "currency", "expires_at")):
                    raise HTTPException(409, "Параметры платежа не совпадают")
                return view(old)

        data = {**body.model_dump(), "id": uid(), "state": "pending", "created_at": now()}
        try:
            with rt.transaction() as conn:
                conn.execute(insert(payments).values(**data))
        except IntegrityError:
            return existing()
        return view(data)

    @app.get("/internal/payments/order/{order_id}", dependencies=[Depends(rt.internal)])
    def payment_by_order(order_id: str):
        with rt.engine.connect() as conn:
            row = conn.execute(select(payments).where(payments.c.order_id == order_id)).mappings().first()
            return view(dict(row)) if row else {"state": "missing"}

    @app.post("/payments/{payment_id}/confirm")
    def demo_confirm(payment_id: str, user=Depends(current_user)):
        if not rt.settings.demo_payments:
            raise HTTPException(404, "Тестовая оплата отключена")
        with rt.transaction() as conn:
            payment = one(
                conn,
                locked(
                    select(payments).where(payments.c.id == payment_id, payments.c.buyer_id == user["sub"])
                ),
            )
            if payment["state"] == "succeeded":
                return view(payment)
            if payment["state"] != "pending" or payment["expires_at"] <= now():
                raise HTTPException(409, "Платёж недоступен или бронь истекла")
            conn.execute(update(payments).where(payments.c.id == payment_id).values(state="succeeded"))
        return view({**payment, "state": "succeeded"})

    @app.post("/internal/payments/order/{order_id}/close", dependencies=[Depends(rt.internal)])
    def close(order_id: str):
        # Cancellation and confirmation serialize on the same row, removing late-payment races.
        with rt.transaction() as conn:
            payment = (
                conn.execute(locked(select(payments).where(payments.c.order_id == order_id)))
                .mappings()
                .first()
            )
            if not payment:
                return {"state": "missing"}
            state = "refunded" if payment["state"] in ("succeeded", "refunded") else "cancelled"
            conn.execute(update(payments).where(payments.c.order_id == order_id).values(state=state))
            return view({**payment, "state": state})

    return app
