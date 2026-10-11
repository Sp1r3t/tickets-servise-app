import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, insert, select, update

from services.common.contracts import EventInput, HallInput
from services.common.core import Runtime, base_app, locked, now, one, uid

metadata = MetaData()
halls = Table(
    "halls",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("owner_id", String(36), index=True, nullable=False),
    Column("name", String(150), nullable=False),
    Column("layout", JSON, nullable=False),
    Column("revision", Integer, nullable=False),
    Column("updated_at", Integer, nullable=False),
)
events = Table(
    "events",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("owner_id", String(36), index=True, nullable=False),
    Column("status", String(20), nullable=False),
    Column("slug", String(80), unique=True, nullable=False),
    Column("details", JSON, nullable=False),
    Column("layout", JSON),
    Column("created_at", Integer, nullable=False),
)


def create_app(settings=None):
    rt = Runtime("catalog", metadata, settings)
    app = base_app("catalog", rt)
    current_user = rt.user_dependency()

    def organizer(user=Depends(current_user)):
        if user["role"] != "organizer":
            raise HTTPException(403, "Нужен аккаунт организатора")
        return user

    def own(conn, table, identifier, user, lock=False):
        query = select(table).where(table.c.id == identifier, table.c.owner_id == user["sub"])
        return one(conn, locked(query) if lock else query)

    @app.get("/halls")
    def list_halls(user=Depends(organizer)):
        with rt.engine.connect() as conn:
            return [
                dict(x)
                for x in conn.execute(
                    select(halls).where(halls.c.owner_id == user["sub"]).order_by(halls.c.updated_at.desc())
                ).mappings()
            ]

    @app.post("/halls", status_code=201)
    def create_hall(body: HallInput, user=Depends(organizer)):
        data = {
            "id": uid(),
            "owner_id": user["sub"],
            "name": body.name,
            "layout": body.layout.model_dump(),
            "revision": 1,
            "updated_at": now(),
        }
        with rt.transaction() as conn:
            conn.execute(insert(halls).values(**data))
        return data

    @app.put("/halls/{hall_id}")
    def save_hall(hall_id: str, body: HallInput, user=Depends(organizer)):
        with rt.transaction() as conn:
            old = own(conn, halls, hall_id, user, True)
            if old["revision"] != body.revision:
                raise HTTPException(409, "Зал изменён в другой вкладке. Откройте актуальную версию.")
            conn.execute(
                update(halls)
                .where(halls.c.id == hall_id)
                .values(
                    name=body.name,
                    layout=body.layout.model_dump(),
                    revision=old["revision"] + 1,
                    updated_at=now(),
                )
            )
            return own(conn, halls, hall_id, user)

    @app.get("/organizer/events")
    def organizer_events(user=Depends(organizer)):
        with rt.engine.connect() as conn:
            return [
                dict(x)
                for x in conn.execute(
                    select(events)
                    .where(events.c.owner_id == user["sub"])
                    .order_by(events.c.created_at.desc())
                ).mappings()
            ]

    @app.post("/organizer/events", status_code=201)
    def create_event(body: EventInput, user=Depends(organizer)):
        if body.starts_at <= datetime.now(timezone.utc):
            raise HTTPException(422, "Концерт должен начинаться в будущем")
        data = {
            "id": uid(),
            "owner_id": user["sub"],
            "status": "draft",
            "slug": secrets.token_urlsafe(18),
            "details": body.model_dump(mode="json"),
            "layout": None,
            "created_at": now(),
        }
        with rt.transaction() as conn:
            own(conn, halls, body.hall_id, user)
            conn.execute(insert(events).values(**data))
        return data

    @app.put("/organizer/events/{event_id}")
    def edit_event(event_id: str, body: EventInput, user=Depends(organizer)):
        with rt.transaction() as conn:
            old = own(conn, events, event_id, user, True)
            if old["status"] != "draft":
                raise HTTPException(409, "После публикации схема и условия зафиксированы")
            own(conn, halls, body.hall_id, user)
            if body.starts_at <= datetime.now(timezone.utc):
                raise HTTPException(422, "Концерт должен начинаться в будущем")
            conn.execute(
                update(events).where(events.c.id == event_id).values(details=body.model_dump(mode="json"))
            )
            return own(conn, events, event_id, user)

    @app.post("/organizer/events/{event_id}/publish")
    def publish(event_id: str, user=Depends(organizer)):
        # Persist publication intent before calling another service. Retry resumes the same snapshot.
        with rt.transaction() as conn:
            event = own(conn, events, event_id, user, True)
            if event["status"] == "published":
                return event
            if datetime.fromisoformat(event["details"]["starts_at"]) <= datetime.now(timezone.utc):
                raise HTTPException(422, "Концерт уже начался")
            if event["status"] == "draft":
                hall = own(conn, halls, event["details"]["hall_id"], user)
                if not any(not x["blocked"] for x in hall["layout"]["seats"]):
                    raise HTTPException(422, "Добавьте хотя бы одно доступное место")
                event["layout"] = hall["layout"]
                conn.execute(
                    update(events)
                    .where(events.c.id == event_id)
                    .values(status="publishing", layout=event["layout"])
                )
        rt.call(
            "inventory",
            "POST",
            "/internal/events",
            {
                "event_id": event_id,
                "layout": event["layout"],
                "sales_end": int(datetime.fromisoformat(event["details"]["starts_at"]).timestamp()),
            },
        )
        with rt.transaction() as conn:
            conn.execute(update(events).where(events.c.id == event_id).values(status="published"))
            return own(conn, events, event_id, user)

    @app.get("/events")
    def public_events(limit: int = 50, offset: int = 0):
        if not 1 <= limit <= 100 or offset < 0:
            raise HTTPException(422, "Некорректная пагинация")
        with rt.engine.connect() as conn:
            rows = conn.execute(
                select(events)
                .where(events.c.status == "published")
                .order_by(events.c.created_at.desc())
                .limit(limit)
                .offset(offset)
            ).mappings()
            return [{k: row[k] for k in ("id", "slug", "details")} for row in rows]

    @app.get("/widgets/{slug}")
    def widget(slug: str):
        with rt.engine.connect() as conn:
            event = one(conn, select(events).where(events.c.slug == slug, events.c.status == "published"))
        return {k: event[k] for k in ("id", "slug", "details", "layout")}

    @app.get("/internal/events/{event_id}", dependencies=[Depends(rt.internal)])
    def internal_event(event_id: str):
        with rt.engine.connect() as conn:
            return one(conn, select(events).where(events.c.id == event_id))

    return app
