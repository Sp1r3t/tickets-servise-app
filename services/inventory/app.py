import json

from fastapi import Depends, HTTPException
from pydantic import Field
from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from services.common.contracts import Layout, StrictModel
from services.common.core import Runtime, base_app, fingerprint, locked, now, one

metadata = MetaData()
event_stock = Table(
    "event_stock",
    metadata,
    Column("event_id", String(36), primary_key=True),
    Column("snapshot_hash", String(64), nullable=False),
    Column("sales_end", Integer, nullable=False),
)
stock = Table(
    "stock",
    metadata,
    Column("event_id", String(36), primary_key=True),
    Column("seat_id", String(80), primary_key=True),
    Column("price", Integer, nullable=False),
    Column("label", JSON, nullable=False),
    Column("state", String(20), nullable=False),
    Column("hold_id", String(36)),
    Column("expires_at", Integer),
)
holds = Table(
    "holds",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("event_id", String(36), nullable=False),
    Column("buyer_id", String(36), nullable=False),
    Column("request_hash", String(64), nullable=False),
    Column("state", String(20), nullable=False),
    Column("expires_at", Integer, nullable=False),
    Column("items", JSON, nullable=False),
)


class Initialize(StrictModel):
    event_id: str
    layout: Layout
    sales_end: int


class Reserve(StrictModel):
    id: str
    event_id: str
    buyer_id: str
    seat_ids: list[str] = Field(min_length=1, max_length=8)


def create_app(settings=None):
    rt = Runtime("inventory", metadata, settings)
    app = base_app("inventory", rt)

    def ensure(conn, table, values):
        stmt = (sqlite_insert if rt.sqlite else pg_insert)(table).values(**values).on_conflict_do_nothing()
        # psycopg may report rowcount=-1 for this DML shape. RETURNING is authoritative.
        return conn.execute(stmt.returning(*table.primary_key.columns)).first() is not None

    @app.post("/internal/events", dependencies=[Depends(rt.internal)])
    def initialize(body: Initialize):
        snapshot = body.layout.model_dump()
        # Preserve fingerprints created before optional geometry extensions existed.
        if snapshot["levels"] == [{"id": "ground", "name": "Партер"}]:
            snapshot.pop("levels")
        if not snapshot["objects"]:
            snapshot.pop("objects")
        for shape in [snapshot["stage"], *snapshot.get("objects", [])]:
            for key, default in (
                ("shape", "rect"),
                ("rotation", 0),
                ("level_id", "ground"),
                ("points", []),
                ("variant", "plain"),
                ("appearance", None),
            ):
                if shape.get(key) == default:
                    shape.pop(key)
        for seat in snapshot["seats"]:
            if seat["level_id"] == "ground":
                seat.pop("level_id")
            if seat["rotation"] == 0:
                seat.pop("rotation")
        digest = fingerprint(json.dumps(snapshot, sort_keys=True))
        with rt.transaction() as conn:
            created = ensure(
                conn,
                event_stock,
                {"event_id": body.event_id, "snapshot_hash": digest, "sales_end": body.sales_end},
            )
            if not created:
                existing = one(conn, select(event_stock).where(event_stock.c.event_id == body.event_id))
                if existing["snapshot_hash"] != digest or existing["sales_end"] != body.sales_end:
                    raise HTTPException(409, "Остатки уже созданы для другой версии схемы")
                return {"ok": True}
            categories = {c.id: c for c in body.layout.categories}
            records = [
                {
                    "event_id": body.event_id,
                    "seat_id": s.id,
                    "price": categories[s.category_id].price,
                    "label": {
                        "section": s.section,
                        "row": s.row,
                        "number": s.number,
                        "category": categories[s.category_id].name,
                        "accessible": s.accessible,
                        "level": next(level.name for level in body.layout.levels if level.id == s.level_id),
                    },
                    "state": "blocked" if s.blocked else "available",
                }
                for s in body.layout.seats
            ]
            if records:
                conn.execute(insert(stock), records)
        return {"ok": True}

    @app.get("/inventory/{event_id}")
    def availability(event_id: str):
        with rt.engine.connect() as conn:
            event = one(conn, select(event_stock).where(event_stock.c.event_id == event_id))
            rows = conn.execute(select(stock).where(stock.c.event_id == event_id)).mappings()
            return {
                "event_id": event_id,
                "server_time": now(),
                "sales_open": event["sales_end"] > now(),
                "seats": [
                    {
                        "id": x["seat_id"],
                        "price": x["price"],
                        "state": "available"
                        if x["state"] == "held" and x["expires_at"] <= now()
                        else x["state"],
                    }
                    for x in rows
                ],
            }

    @app.post("/internal/holds", dependencies=[Depends(rt.internal)])
    def reserve(body: Reserve):
        if len(set(body.seat_ids)) != len(body.seat_ids):
            raise HTTPException(422, "Повторяющиеся места")
        digest = fingerprint(json.dumps([body.event_id, body.buyer_id, sorted(body.seat_ids)]))
        with rt.transaction() as conn:
            event = one(conn, select(event_stock).where(event_stock.c.event_id == body.event_id))
            created = ensure(
                conn,
                holds,
                {
                    "id": body.id,
                    "event_id": body.event_id,
                    "buyer_id": body.buyer_id,
                    "request_hash": digest,
                    "state": "initializing",
                    "expires_at": min(now() + rt.settings.hold_seconds, event["sales_end"]),
                    "items": [],
                },
            )
            hold = one(conn, locked(select(holds).where(holds.c.id == body.id)))
            if not created:
                if hold["request_hash"] != digest:
                    raise HTTPException(409, "ID брони использован с другим запросом")
                return hold
            if event["sales_end"] <= now():
                raise HTTPException(409, "Продажа на этот концерт завершена")
            seats = [
                dict(x)
                for x in conn.execute(
                    locked(
                        select(stock)
                        .where(stock.c.event_id == body.event_id, stock.c.seat_id.in_(body.seat_ids))
                        .order_by(stock.c.seat_id)
                    )
                ).mappings()
            ]
            if len(seats) != len(body.seat_ids):
                raise HTTPException(404, "Место не найдено")
            for seat in seats:
                if seat["state"] not in ("available", "held") or (
                    seat["state"] == "held" and seat["expires_at"] > now()
                ):
                    raise HTTPException(409, "Одно из мест уже занято. Выберите другие места.")
            items = [{"seat_id": x["seat_id"], "price": x["price"], **x["label"]} for x in seats]
            conn.execute(
                update(stock)
                .where(stock.c.event_id == body.event_id, stock.c.seat_id.in_(body.seat_ids))
                .values(state="held", hold_id=body.id, expires_at=hold["expires_at"])
            )
            conn.execute(update(holds).where(holds.c.id == body.id).values(state="held", items=items))
            return {**hold, "state": "held", "items": items}

    @app.get("/internal/holds/{hold_id}", dependencies=[Depends(rt.internal)])
    def get_hold(hold_id: str):
        with rt.engine.connect() as conn:
            return one(conn, select(holds).where(holds.c.id == hold_id))

    @app.post("/internal/holds/{hold_id}/commit", dependencies=[Depends(rt.internal)])
    def commit(hold_id: str):
        with rt.transaction() as conn:
            hold = one(conn, locked(select(holds).where(holds.c.id == hold_id)))
            if hold["state"] == "sold":
                return hold
            if hold["state"] != "held" or hold["expires_at"] <= now():
                raise HTTPException(409, "Бронь истекла")
            seats = list(
                conn.execute(
                    locked(
                        select(stock)
                        .where(
                            stock.c.event_id == hold["event_id"],
                            stock.c.seat_id.in_([x["seat_id"] for x in hold["items"]]),
                        )
                        .order_by(stock.c.seat_id)
                    )
                ).mappings()
            )
            if any(x["hold_id"] != hold_id or x["state"] != "held" for x in seats):
                raise HTTPException(409, "Места уже недоступны")
            conn.execute(
                update(stock).where(stock.c.hold_id == hold_id).values(state="sold", expires_at=None)
            )
            conn.execute(update(holds).where(holds.c.id == hold_id).values(state="sold"))
            return {**hold, "state": "sold"}

    @app.post("/internal/holds/{hold_id}/release", dependencies=[Depends(rt.internal)])
    def release(hold_id: str):
        with rt.transaction() as conn:
            hold = one(conn, locked(select(holds).where(holds.c.id == hold_id)))
            if hold["state"] == "sold":
                raise HTTPException(409, "Проданные места нельзя снять как бронь")
            conn.execute(
                update(stock)
                .where(stock.c.hold_id == hold_id, stock.c.state == "held")
                .values(state="available", hold_id=None, expires_at=None)
            )
            conn.execute(update(holds).where(holds.c.id == hold_id).values(state="released"))
        return {"ok": True}

    return app
