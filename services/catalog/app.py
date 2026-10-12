import secrets
import hashlib
import json
import unicodedata
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Query
from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

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

# Independent, immutable community snapshots. No owner email or private draft is shared.
hall_templates = Table(
    "hall_templates",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("venue_key", String(64), nullable=False, index=True),
    Column("search_text", String(600), nullable=False, index=True),
    Column("city", String(120), nullable=False),
    Column("venue", String(180), nullable=False),
    Column("address", String(250), nullable=False),
    Column("source_hall_id", String(36), nullable=False),
    Column("name", String(150), nullable=False),
    Column("author", String(180), nullable=False),
    Column("layout", JSON, nullable=False),
    Column("created_at", Integer, nullable=False),
)
hall_sources = Table(
    "hall_sources",
    metadata,
    Column("hall_id", String(36), primary_key=True),
    Column("template_id", String(64), nullable=False),
)

catalog_tasks = Table(
    "catalog_tasks",
    metadata,
    Column("id", String(80), primary_key=True),
    Column("completed_at", Integer, nullable=False),
)


def normalized(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().replace("ё", "е").split())


def share_snapshot(conn, rt, event):
    details = event["details"]
    venue_text = " | ".join(normalized(details[key]) for key in ("city", "venue", "address"))
    venue_key = hashlib.sha256(venue_text.encode()).hexdigest()
    digest = hashlib.sha256(
        json.dumps(event["layout"], sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    identifier = hashlib.sha256(f"{venue_key}:{details['hall_id']}:{digest}".encode()).hexdigest()
    source = conn.execute(select(halls.c.name).where(halls.c.id == details["hall_id"])).scalar_one_or_none()
    stmt = (
        (sqlite_insert if rt.sqlite else pg_insert)(hall_templates)
        .values(
            id=identifier,
            venue_key=venue_key,
            search_text=venue_text,
            city=details["city"],
            venue=details["venue"],
            address=details["address"],
            source_hall_id=details["hall_id"],
            name=source or details["venue"],
            author=details["organizer_name"],
            layout=event["layout"],
            created_at=event["created_at"],
        )
        .on_conflict_do_nothing()
    )
    conn.execute(stmt)


def create_app(settings=None):
    rt = Runtime("catalog", metadata, settings)
    app = base_app("catalog", rt)
    current_user = rt.user_dependency()
    # The marker and backfill commit together. Concurrent workers wait on its PK.
    with rt.transaction() as conn:
        marker = (
            (sqlite_insert if rt.sqlite else pg_insert)(catalog_tasks)
            .values(id="community-library-v1", completed_at=now())
            .on_conflict_do_nothing()
        )
        if conn.execute(marker.returning(catalog_tasks.c.id)).first():
            for event in conn.execute(select(events).where(events.c.status == "published")).mappings():
                share_snapshot(conn, rt, event)

    def organizer(user=Depends(current_user)):
        if user["role"] != "organizer":
            raise HTTPException(403, "Нужен аккаунт организатора")
        return user

    def own(conn, table, identifier, user, lock=False):
        query = select(table).where(table.c.id == identifier, table.c.owner_id == user["sub"])
        return one(conn, locked(query) if lock else query)

    @app.get("/organizer/library")
    def library(
        search: str = Query(default="", max_length=180),
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
        user=Depends(organizer),
    ):
        with rt.engine.connect() as conn:
            query = select(hall_templates).order_by(hall_templates.c.created_at.desc(), hall_templates.c.id)
            for token in normalized(search).split():
                query = query.where(hall_templates.c.search_text.contains(token, autoescape=True))
            rows = list(conn.execute(query.limit(limit + 1).offset(offset)).mappings())
            groups = {}
            for row in rows[:limit]:
                group = groups.setdefault(
                    row["venue_key"], {k: row[k] for k in ("venue_key", "city", "venue", "address")}
                )
                layout = row["layout"]
                group.setdefault("templates", []).append(
                    {
                        **{k: row[k] for k in ("id", "name", "author", "created_at")},
                        "seat_count": len(layout["seats"]),
                        "level_count": len(layout.get("levels", [1])),
                    }
                )
            return {"venues": list(groups.values()), "has_more": len(rows) > limit}

    @app.get("/organizer/library/{template_id}")
    def template(template_id: str, user=Depends(organizer)):
        with rt.engine.connect() as conn:
            row = one(conn, select(hall_templates).where(hall_templates.c.id == template_id))
            return {k: row[k] for k in ("id", "name", "author", "layout", "city", "venue", "address")}

    @app.post("/organizer/library/{template_id}/copy", status_code=201)
    def copy_template(template_id: str, user=Depends(organizer)):
        with rt.transaction() as conn:
            row = one(conn, select(hall_templates).where(hall_templates.c.id == template_id))
            data = {
                "id": uid(),
                "owner_id": user["sub"],
                "name": row["name"],
                "layout": row["layout"],
                "revision": 1,
                "updated_at": now(),
            }
            conn.execute(insert(halls).values(**data))
            conn.execute(insert(hall_sources).values(hall_id=data["id"], template_id=template_id))
            return {**data, "venue_info": {k: row[k] for k in ("city", "venue", "address", "author")}}

    @app.get("/halls")
    def list_halls(user=Depends(organizer)):
        with rt.engine.connect() as conn:
            rows = list(
                conn.execute(
                    select(halls).where(halls.c.owner_id == user["sub"]).order_by(halls.c.updated_at.desc())
                ).mappings()
            )
            sources = {
                r["hall_id"]: r
                for r in conn.execute(
                    select(
                        hall_sources.c.hall_id,
                        hall_templates.c.city,
                        hall_templates.c.venue,
                        hall_templates.c.address,
                        hall_templates.c.author,
                    )
                    .join(hall_templates, hall_sources.c.template_id == hall_templates.c.id)
                    .where(hall_sources.c.hall_id.in_([r["id"] for r in rows]))
                ).mappings()
            }
            return [
                {
                    **dict(row),
                    "venue_info": {k: sources[row["id"]][k] for k in ("city", "venue", "address", "author")}
                    if row["id"] in sources
                    else None,
                }
                for row in rows
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
                share_snapshot(conn, rt, event)
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
            published = own(conn, events, event_id, user)
            share_snapshot(conn, rt, published)
            return published

    @app.get("/events")
    def public_events(
        limit: int = 50,
        offset: int = 0,
        city: str = Query(default="", max_length=120),
        search: str = Query(default="", max_length=180),
        genre: str = Query(default="", max_length=30),
    ):
        if not 1 <= limit <= 100 or offset < 0:
            raise HTTPException(422, "Некорректная пагинация")
        with rt.engine.connect() as conn:
            query = select(events).where(events.c.status == "published")
            if city:
                query = query.where(events.c.details["city"].as_string() == city)
            if search:
                query = query.where(
                    events.c.details["title"].as_string().ilike(f"%{search}%")
                    | events.c.details["artist"].as_string().ilike(f"%{search}%")
                )
            if genre:
                query = query.where(events.c.details["genre"].as_string() == genre)
            rows = conn.execute(
                query.order_by(events.c.created_at.desc()).limit(limit).offset(offset)
            ).mappings()
            return [
                {
                    **{k: row[k] for k in ("id", "slug", "details")},
                    "min_price": min(
                        (
                            category["price"]
                            for category in row["layout"]["categories"]
                            if any(
                                not seat["blocked"] and seat["category_id"] == category["id"]
                                for seat in row["layout"]["seats"]
                            )
                        ),
                        default=None,
                    ),
                }
                for row in rows
            ]

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
