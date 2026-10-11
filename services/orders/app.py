import asyncio
import json
import logging
from contextlib import asynccontextmanager

import jwt
from fastapi import Depends, Header, HTTPException
from pydantic import Field
from sqlalchemy import (
    JSON,
    Column,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from services.common.contracts import StrictModel
from services.common.core import Runtime, base_app, fingerprint, locked, now, one, uid

metadata = MetaData()
orders = Table(
    "orders",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("buyer_id", String(36), index=True, nullable=False),
    Column("event_id", String(36), index=True, nullable=False),
    Column("idempotency_key", String(128), nullable=False),
    Column("request_hash", String(64), nullable=False),
    Column("state", String(20), nullable=False),
    Column("seat_ids", JSON, nullable=False),
    Column("items", JSON, nullable=False),
    Column("event_snapshot", JSON, nullable=False),
    Column("amount", Integer, nullable=False),
    Column("expires_at", Integer, nullable=False),
    Column("created_at", Integer, nullable=False),
    Column("next_check_at", Integer, nullable=False),
    UniqueConstraint("buyer_id", "idempotency_key", name="uq_order_idempotency"),
)
tickets = Table(
    "tickets",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("order_id", String(36), index=True, nullable=False),
    Column("event_id", String(36), nullable=False),
    Column("seat_id", String(80), nullable=False),
    Column("buyer_id", String(36), nullable=False),
    Column("item", JSON, nullable=False),
    Column("checked_in_at", Integer),
    UniqueConstraint("event_id", "seat_id", name="uq_ticket_seat"),
)


class OrderInput(StrictModel):
    event_id: str
    seat_ids: list[str] = Field(min_length=1, max_length=8)


class ScanInput(StrictModel):
    code: str = Field(min_length=20, max_length=2048)


def create_app(settings=None):
    rt = Runtime("orders", metadata, settings)
    current_user = rt.user_dependency()

    def reconcile(order_id):
        # Lock the local saga while executing idempotent steps. A crashed step is retried by the worker.
        with rt.transaction() as conn:
            order = one(conn, locked(select(orders).where(orders.c.id == order_id)))
            if order["state"] in ("paid", "cancelled", "expired", "failed", "refunded"):
                return order
            if order["state"] == "cancelling":
                closed = rt.call("payments", "POST", f"/internal/payments/order/{order_id}/close")
                rt.call("inventory", "POST", f"/internal/holds/{order_id}/release")
                state = "refunded" if closed["state"] == "refunded" else "cancelled"
                conn.execute(update(orders).where(orders.c.id == order_id).values(state=state))
                return {**order, "state": state}
            if order["state"] == "creating":
                try:
                    hold = rt.call(
                        "inventory",
                        "POST",
                        "/internal/holds",
                        {
                            "id": order_id,
                            "event_id": order["event_id"],
                            "buyer_id": order["buyer_id"],
                            "seat_ids": order["seat_ids"],
                        },
                    )
                except HTTPException as exc:
                    if exc.status_code in (404, 409, 422):
                        conn.execute(update(orders).where(orders.c.id == order_id).values(state="failed"))
                        return {**order, "state": "failed"}
                    raise
                order.update(
                    state="pending",
                    items=hold["items"],
                    expires_at=hold["expires_at"],
                    amount=sum(x["price"] for x in hold["items"]),
                )
                conn.execute(
                    update(orders)
                    .where(orders.c.id == order_id)
                    .values(**{k: order[k] for k in ("state", "items", "expires_at", "amount")})
                )
            payment = rt.call("payments", "GET", f"/internal/payments/order/{order_id}")
            if payment["state"] in ("refunded", "cancelled"):
                rt.call("inventory", "POST", f"/internal/holds/{order_id}/release")
                state = "refunded" if payment["state"] == "refunded" else "cancelled"
                conn.execute(update(orders).where(orders.c.id == order_id).values(state=state))
                return {**order, "state": state}
            if payment["state"] == "succeeded":
                if (
                    payment["amount"] != order["amount"]
                    or payment["currency"] != "RUB"
                    or payment["buyer_id"] != order["buyer_id"]
                ):
                    raise HTTPException(409, "Несовпадение платежа и заказа")
                try:
                    rt.call("inventory", "POST", f"/internal/holds/{order_id}/commit")
                except HTTPException as exc:
                    if exc.status_code != 409:
                        raise
                    rt.call("payments", "POST", f"/internal/payments/order/{order_id}/close")
                    rt.call("inventory", "POST", f"/internal/holds/{order_id}/release")
                    conn.execute(update(orders).where(orders.c.id == order_id).values(state="refunded"))
                    return {**order, "state": "refunded"}
                for item in order["items"]:
                    conn.execute(
                        insert(tickets).values(
                            id=uid(),
                            order_id=order_id,
                            event_id=order["event_id"],
                            seat_id=item["seat_id"],
                            buyer_id=order["buyer_id"],
                            item=item,
                        )
                    )
                conn.execute(update(orders).where(orders.c.id == order_id).values(state="paid"))
                return {**order, "state": "paid"}
            if order["expires_at"] <= now():
                closed = rt.call("payments", "POST", f"/internal/payments/order/{order_id}/close")
                rt.call("inventory", "POST", f"/internal/holds/{order_id}/release")
                state = "refunded" if closed["state"] == "refunded" else "expired"
                conn.execute(update(orders).where(orders.c.id == order_id).values(state=state))
                return {**order, "state": state}
            return order

    def sweep():
        with rt.engine.connect() as conn:
            ids = list(
                conn.execute(
                    select(orders.c.id)
                    .where(
                        orders.c.state.in_(["creating", "pending", "cancelling"]),
                        orders.c.next_check_at <= now(),
                    )
                    .order_by(orders.c.next_check_at)
                    .limit(100)
                ).scalars()
            )
        for order_id in ids:
            try:
                with rt.transaction() as conn:
                    conn.execute(
                        update(orders).where(orders.c.id == order_id).values(next_check_at=now() + 3)
                    )
                reconcile(order_id)
            except Exception:
                logging.getLogger("ticketflow").exception("Order reconciliation failed: %s", order_id)

    @asynccontextmanager
    async def lifespan(app):
        async def run():
            while True:
                await asyncio.to_thread(sweep)
                await asyncio.sleep(3)

        task = asyncio.create_task(run())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    app = base_app("orders", rt, lifespan)
    app.state.reconcile = reconcile
    app.state.sweep = sweep

    def owned(order_id, user):
        with rt.engine.connect() as conn:
            return one(conn, select(orders).where(orders.c.id == order_id, orders.c.buyer_id == user["sub"]))

    def view(order):
        with rt.engine.connect() as conn:
            rows = [
                dict(x)
                for x in conn.execute(select(tickets).where(tickets.c.order_id == order["id"])).mappings()
            ]
        for ticket in rows:
            ticket["code"] = jwt.encode(
                {
                    "sub": ticket["id"],
                    "event_id": ticket["event_id"],
                    "aud": "ticketflow-entry",
                    "iss": "ticketflow-orders",
                },
                rt.settings.jwt_secret,
                algorithm="HS256",
            )
        return {
            k: v
            for k, v in {**order, "tickets": rows, "currency": "RUB", "server_time": now()}.items()
            if k not in ("idempotency_key", "request_hash", "buyer_id", "next_check_at")
        }

    @app.post("/orders", status_code=201)
    def create_order(
        body: OrderInput,
        idempotency_key: str = Header(min_length=8, max_length=128),
        user=Depends(current_user),
    ):
        if len(set(body.seat_ids)) != len(body.seat_ids):
            raise HTTPException(422, "Повторяющиеся места")
        digest = fingerprint(json.dumps([body.event_id, sorted(body.seat_ids)]))
        with rt.engine.connect() as conn:
            old = (
                conn.execute(
                    select(orders).where(
                        orders.c.buyer_id == user["sub"], orders.c.idempotency_key == idempotency_key
                    )
                )
                .mappings()
                .first()
            )
        if old:
            if old["request_hash"] != digest:
                raise HTTPException(409, "Ключ повторного запроса уже использован с другими местами")
            return view(reconcile(old["id"]))
        event = rt.call("catalog", "GET", f"/internal/events/{body.event_id}")
        if event["status"] != "published":
            raise HTTPException(409, "Концерт ещё не опубликован")
        data = {
            "id": uid(),
            "buyer_id": user["sub"],
            "event_id": body.event_id,
            "idempotency_key": idempotency_key,
            "request_hash": digest,
            "state": "creating",
            "seat_ids": sorted(body.seat_ids),
            "items": [],
            "event_snapshot": event["details"],
            "amount": 0,
            "expires_at": now() + rt.settings.hold_seconds,
            "created_at": now(),
            "next_check_at": 0,
        }
        try:
            with rt.transaction() as conn:
                conn.execute(insert(orders).values(**data))
        except IntegrityError:
            with rt.engine.connect() as conn:
                data = one(
                    conn,
                    select(orders).where(
                        orders.c.buyer_id == user["sub"], orders.c.idempotency_key == idempotency_key
                    ),
                )
            if data["request_hash"] != digest:
                raise HTTPException(409, "Ключ запроса использован с другими местами")
        return view(reconcile(data["id"]))

    @app.get("/orders")
    def list_orders(limit: int = 50, offset: int = 0, user=Depends(current_user)):
        if not 1 <= limit <= 100 or offset < 0:
            raise HTTPException(422, "Некорректная пагинация")
        with rt.engine.connect() as conn:
            ids = list(
                conn.execute(
                    select(orders.c.id)
                    .where(orders.c.buyer_id == user["sub"])
                    .order_by(orders.c.created_at.desc())
                    .limit(limit)
                    .offset(offset)
                ).scalars()
            )
        return [view(reconcile(order_id)) for order_id in ids]

    @app.get("/orders/{order_id}")
    def get_order(order_id: str, user=Depends(current_user)):
        owned(order_id, user)
        return view(reconcile(order_id))

    @app.post("/orders/{order_id}/checkout")
    def checkout(order_id: str, user=Depends(current_user)):
        owned(order_id, user)
        reconcile(order_id)
        with rt.transaction() as conn:
            order = one(conn, locked(select(orders).where(orders.c.id == order_id)))
            if order["state"] != "pending" or order["expires_at"] <= now():
                raise HTTPException(409, "Заказ уже оплачен, закрыт или истёк")
            return rt.call(
                "payments",
                "POST",
                "/internal/payments",
                {
                    "order_id": order_id,
                    "buyer_id": user["sub"],
                    "amount": order["amount"],
                    "currency": "RUB",
                    "expires_at": order["expires_at"],
                },
            )

    @app.post("/orders/{order_id}/cancel")
    def cancel(order_id: str, user=Depends(current_user)):
        owned(order_id, user)
        reconcile(order_id)
        with rt.transaction() as conn:
            order = one(conn, locked(select(orders).where(orders.c.id == order_id)))
            if order["state"] in ("cancelled", "expired", "failed", "refunded"):
                return view(order)
            if order["state"] != "pending":
                raise HTTPException(409, "Оплаченный заказ нельзя отменить как бронь")
            payment = rt.call("payments", "GET", f"/internal/payments/order/{order_id}")
            if payment["state"] == "succeeded":
                raise HTTPException(409, "Оплата уже получена. Обновите заказ.")
            conn.execute(update(orders).where(orders.c.id == order_id).values(state="cancelling"))
        return view(reconcile(order_id))

    @app.get("/organizer/events/{event_id}/sales")
    def sales(event_id: str, user=Depends(current_user)):
        event = rt.call("catalog", "GET", f"/internal/events/{event_id}")
        if user["role"] != "organizer" or event["owner_id"] != user["sub"]:
            raise HTTPException(403, "Нет доступа к продажам")
        with rt.engine.connect() as conn:
            rows = list(conn.execute(select(orders).where(orders.c.event_id == event_id)).mappings())
            ticket_rows = list(conn.execute(select(tickets).where(tickets.c.event_id == event_id)).mappings())
        return {
            "sold": len(ticket_rows),
            "revenue": sum(x["amount"] for x in rows if x["state"] == "paid"),
            "checked_in": sum(x["checked_in_at"] is not None for x in ticket_rows),
            "pending": sum(
                len(x["seat_ids"]) for x in rows if x["state"] == "pending" and x["expires_at"] > now()
            ),
        }

    @app.post("/tickets/scan")
    def scan(body: ScanInput, user=Depends(current_user)):
        if user["role"] != "organizer":
            raise HTTPException(403, "Нужен аккаунт организатора")
        try:
            code = jwt.decode(
                body.code,
                rt.settings.jwt_secret,
                algorithms=["HS256"],
                audience="ticketflow-entry",
                issuer="ticketflow-orders",
                options={"require": ["sub", "event_id", "aud", "iss"]},
            )
        except jwt.InvalidTokenError as exc:
            raise HTTPException(422, "Неверный код билета") from exc
        event = rt.call("catalog", "GET", f"/internal/events/{code['event_id']}")
        if event["owner_id"] != user["sub"]:
            raise HTTPException(403, "Билет принадлежит другому организатору")
        with rt.transaction() as conn:
            ticket = one(
                conn,
                locked(
                    select(tickets).where(tickets.c.id == code["sub"], tickets.c.event_id == code["event_id"])
                ),
            )
            if ticket["checked_in_at"]:
                raise HTTPException(409, "Билет уже использован")
            conn.execute(update(tickets).where(tickets.c.id == ticket["id"]).values(checked_in_at=now()))
            return {"ok": True, "item": ticket["item"], "checked_in_at": now()}

    return app
