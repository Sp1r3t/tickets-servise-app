from copy import deepcopy

from services.common.contracts import Layout


def test_library_shares_only_publications_and_copies_are_independent(platform, accounts, concert):
    client = platform["clients"]["catalog"]
    hall = concert["hall"]
    assert client.get("/organizer/library", headers=accounts["buyer"]).status_code == 403
    assert client.get("/organizer/library").status_code == 401
    result = client.get("/organizer/library?search=МОСКВА", headers=accounts["other_seller"]).json()
    assert len(result["venues"]) == 1
    venue = result["venues"][0]
    template = venue["templates"][0]
    assert venue["venue"] == "Клуб"
    assert "owner_id" not in template and "email" not in template
    assert template["seat_count"] == 5
    assert (
        client.post(f"/organizer/events/{concert['id']}/publish", headers=accounts["seller"]).status_code
        == 200
    )
    assert (
        len(client.get("/organizer/library", headers=accounts["seller"]).json()["venues"][0]["templates"])
        == 1
    )
    copied = client.post(f"/organizer/library/{template['id']}/copy", headers=accounts["other_seller"])
    assert copied.status_code == 201, copied.text
    copy = copied.json()
    assert copy["id"] != hall["id"]
    assert copy["venue_info"]["address"] == concert["details"]["address"]
    changed = deepcopy(copy["layout"])
    changed["categories"][0]["price"] = 990000
    saved = client.put(
        f"/halls/{copy['id']}",
        headers=accounts["other_seller"],
        json={"name": "Собственная версия", "layout": changed, "revision": 1},
    )
    assert saved.status_code == 200
    assert (
        client.put(
            f"/halls/{copy['id']}",
            headers=accounts["seller"],
            json={"name": "Чужая версия", "layout": changed, "revision": 2},
        ).status_code
        == 404
    )
    shared = client.get(f"/organizer/library/{template['id']}", headers=accounts["seller"]).json()
    assert shared["layout"]["categories"][0]["price"] == 250000
    assert client.get(f"/widgets/{concert['slug']}").json()["layout"]["categories"][0]["price"] == 250000
    # Editing or creating a private hall never publishes it into the community.
    assert (
        len(client.get("/organizer/library", headers=accounts["seller"]).json()["venues"][0]["templates"])
        == 1
    )
    assert (
        client.get("/organizer/library?search=нет-такой-площадки", headers=accounts["seller"]).json()[
            "venues"
        ]
        == []
    )


def test_same_venue_groups_different_schemes_and_prices(platform, accounts, concert):
    client = platform["clients"]["catalog"]
    layout = deepcopy(concert["hall"]["layout"])
    layout["seats"].pop()
    layout["categories"][0]["price"] = 100000
    hall = client.post(
        "/halls",
        headers=accounts["other_seller"],
        json={"name": "Партер без последнего места", "layout": layout},
    ).json()
    details = {
        **concert["details"],
        "hall_id": hall["id"],
        "venue": "  клуб  ",
        "city": "МОСКВА",
        "address": "  МОСКВА, улица Тестовая, 1  ",
        "genre": "jazz",
    }
    event = client.post("/organizer/events", headers=accounts["other_seller"], json=details).json()
    assert (
        client.post(f"/organizer/events/{event['id']}/publish", headers=accounts["other_seller"]).status_code
        == 200
    )
    groups = client.get("/organizer/library", headers=accounts["seller"]).json()["venues"]
    assert len(groups) == 1 and len(groups[0]["templates"]) == 2
    public = client.get("/events?genre=jazz").json()
    assert len(public) == 1 and public[0]["min_price"] == 100000
    assert client.get("/organizer/library?limit=1", headers=accounts["seller"]).json()["has_more"]


def test_geometry_levels_and_actual_polygon_contour(platform, accounts, concert):
    client = platform["clients"]["catalog"]
    layout = deepcopy(concert["hall"]["layout"])
    layout["stage"].update(
        shape="polygon",
        points=[
            {"x": 0, "y": 0},
            {"x": 1, "y": 0},
            {"x": 1, "y": 1},
            {"x": 0.6, "y": 1},
            {"x": 0.6, "y": 0.6},
            {"x": 0, "y": 0.6},
        ],
    )
    layout["levels"] = [{"id": "ground", "name": "Партер"}, {"id": "balcony", "name": "Балкон"}]
    layout["seats"].append({**layout["seats"][0], "id": "corner", "x": 340, "y": 100, "number": "6"})
    layout["seats"].append({**layout["seats"][0], "id": "upper", "level_id": "balcony"})
    assert Layout.model_validate(layout)
    created = client.post(
        "/halls", headers=accounts["seller"], json={"name": "Сложный зал", "layout": layout}
    )
    assert created.status_code == 201, created.text
    details = {**concert["details"], "hall_id": created.json()["id"]}
    event = client.post("/organizer/events", headers=accounts["seller"], json=details).json()
    assert (
        client.post(f"/organizer/events/{event['id']}/publish", headers=accounts["seller"]).status_code == 200
    )
    reserved = platform["call"](
        "inventory",
        "POST",
        "/internal/holds",
        {
            "id": "test-level-hold",
            "event_id": event["id"],
            "buyer_id": "level-buyer",
            "seat_ids": ["upper"],
        },
    )
    assert reserved["items"][0]["level"] == "Балкон"
    # Same coordinates on the same floor are still forbidden.
    layout["seats"][-1]["level_id"] = "ground"
    assert (
        client.post(
            "/halls", headers=accounts["seller"], json={"name": "Ошибка этажей", "layout": layout}
        ).status_code
        == 422
    )


def test_obstacles_rotated_bounds_and_self_intersection(platform, accounts, concert):
    client = platform["clients"]["catalog"]
    layout = deepcopy(concert["hall"]["layout"])
    layout["objects"] = [
        {
            "id": "column",
            "kind": "column",
            "label": "Колонна",
            "x": 280,
            "y": 190,
            "width": 40,
            "height": 40,
            "blocks_seats": True,
            "shape": "ellipse",
        }
    ]
    assert (
        client.post(
            "/halls", headers=accounts["seller"], json={"name": "Пересечение с колонной", "layout": layout}
        ).status_code
        == 422
    )
    layout["objects"][0].update(blocks_seats=False)
    assert (
        client.post(
            "/halls", headers=accounts["seller"], json={"name": "Декоративный объект", "layout": layout}
        ).status_code
        == 201
    )
    layout["objects"][0].update(x=0, y=0, rotation=45, shape="rect")
    assert (
        client.post(
            "/halls", headers=accounts["seller"], json={"name": "Поворот за границу", "layout": layout}
        ).status_code
        == 422
    )
    layout["objects"] = []
    layout["stage"].update(
        shape="polygon", points=[{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}, {"x": 1, "y": 0}]
    )
    assert (
        client.post(
            "/halls", headers=accounts["seller"], json={"name": "Самопересечение", "layout": layout}
        ).status_code
        == 422
    )


def test_existing_publications_backfill_once_without_sharing_private_data(platform, accounts, concert):
    from sqlalchemy import delete, select
    from services.catalog.app import catalog_tasks, create_app, hall_templates

    rt = platform["apps"]["catalog"].state.runtime
    with rt.transaction() as conn:
        conn.execute(delete(catalog_tasks))
        conn.execute(delete(hall_templates))
    restarted = create_app(rt.settings)
    try:
        with restarted.state.runtime.engine.connect() as conn:
            assert len(conn.execute(select(hall_templates)).all()) == 1
        # A second process sees the completed task; immutable templates remain unchanged.
        again = create_app(rt.settings)
        try:
            with again.state.runtime.engine.connect() as conn:
                assert len(conn.execute(select(hall_templates)).all()) == 1
        finally:
            again.state.runtime.engine.dispose()
    finally:
        restarted.state.runtime.engine.dispose()


def test_legacy_publication_fingerprint_is_compatible(platform, concert):
    import json
    from services.common.core import fingerprint
    from services.inventory.app import event_stock
    from sqlalchemy import select

    legacy = deepcopy(concert["layout"])
    legacy.pop("objects")
    legacy.pop("levels")
    for shape in [legacy["stage"], *legacy["seats"]]:
        for key in ("level_id", "rotation", "shape", "points", "appearance"):
            shape.pop(key, None)
    rt = platform["apps"]["inventory"].state.runtime
    with rt.engine.connect() as conn:
        row = (
            conn.execute(select(event_stock).where(event_stock.c.event_id == concert["id"])).mappings().one()
        )
    assert row["snapshot_hash"] == fingerprint(json.dumps(legacy, sort_keys=True))
    assert platform["call"](
        "inventory",
        "POST",
        "/internal/events",
        {"event_id": concert["id"], "layout": legacy, "sales_end": row["sales_end"]},
    )["ok"]


def test_exact_ellipse_collision_and_rotation():
    from math import cos, sin, pi, hypot
    from services.common.contracts import HallObject
    from services.common.geometry import circle_touches_ellipse, ellipse_bounds

    shape = HallObject(id="ellipse", x=100, y=200, width=800, height=120, rotation=37)
    angle = 37 * pi / 180
    # Exterior points along either principal axis: 12 units is tangency, 11.9 intersects.
    for dx, dy in [(411.9, 0), (0, 71.9)]:
        x, y = 500 + dx * cos(angle) - dy * sin(angle), 260 + dx * sin(angle) + dy * cos(angle)
        assert circle_touches_ellipse(x, y, 12, shape)
    for dx, dy in [(412, 0), (0, 72), (430, 0)]:
        x, y = 500 + dx * cos(angle) - dy * sin(angle), 260 + dx * sin(angle) + dy * cos(angle)
        assert not circle_touches_ellipse(x, y, 12, shape)
    x1, y1, x2, y2 = ellipse_bounds(shape)
    assert abs((x2 - x1) / 2 - hypot(400 * cos(angle), 60 * sin(angle))) < 1e-8
    assert x1 < x2 and y1 < y2


def test_object_variants_survive_publication_and_old_objects_can_retry(platform, accounts, concert):
    import json
    from sqlalchemy import select
    from services.common.core import fingerprint
    from services.inventory.app import event_stock

    catalog = platform["clients"]["catalog"]
    layout = deepcopy(concert["layout"])
    layout["objects"] = [
        {
            "id": "stairs",
            "kind": "stairs",
            "variant": "spiral",
            "shape": "ellipse",
            "x": 60,
            "y": 350,
            "width": 100,
            "height": 100,
            "label": "Лестница",
            "color": "#dce3ef",
            "blocks_seats": True,
        },
        {
            "id": "bar",
            "kind": "bar",
            "x": 760,
            "y": 350,
            "width": 180,
            "height": 80,
            "label": "Бар",
            "color": "#e8d9ef",
            "blocks_seats": True,
        },
    ]
    hall = catalog.post("/halls", headers=accounts["seller"], json={"name": "Объекты", "layout": layout})
    assert hall.status_code == 201, hall.text
    event = catalog.post(
        "/organizer/events",
        headers=accounts["seller"],
        json={**concert["details"], "hall_id": hall.json()["id"]},
    ).json()
    assert (
        catalog.post(f"/organizer/events/{event['id']}/publish", headers=accounts["seller"]).status_code
        == 200
    )
    snapshot = catalog.get(f"/widgets/{event['slug']}").json()["layout"]
    assert snapshot["objects"][0]["variant"] == "spiral"
    assert snapshot["objects"][1]["variant"] == "plain"
    legacy = deepcopy(snapshot)
    legacy.pop("levels")
    for shape in [legacy["stage"], *legacy["objects"], *legacy["seats"]]:
        for key, default in (
            ("level_id", "ground"),
            ("rotation", 0),
            ("shape", "rect"),
            ("points", []),
            ("variant", "plain"),
            ("appearance", None),
        ):
            if shape.get(key) == default:
                shape.pop(key, None)
    rt = platform["apps"]["inventory"].state.runtime
    with rt.engine.connect() as conn:
        row = conn.execute(select(event_stock).where(event_stock.c.event_id == event["id"])).mappings().one()
    assert row["snapshot_hash"] == fingerprint(json.dumps(legacy, sort_keys=True))
    assert platform["call"](
        "inventory",
        "POST",
        "/internal/events",
        {"event_id": event["id"], "layout": legacy, "sales_end": row["sales_end"]},
    )["ok"]
    # Visual style cannot change the geometry rules or existing published snapshots.
    layout["objects"][0]["variant"] = "unknown"
    assert (
        catalog.post(
            "/halls", headers=accounts["seller"], json={"name": "Ошибка", "layout": layout}
        ).status_code
        == 422
    )


def test_furniture_appearance_is_validated_shared_and_immutable(platform, accounts, concert):
    catalog = platform["clients"]["catalog"]
    layout = deepcopy(concert["layout"])
    kinds = ["sofa", "bench", "exit", "wc", "cloakroom", "lift", "sound", "light", "fence", "plant"]
    layout["objects"] = [
        {
            "id": kind,
            "kind": kind,
            "x": 40 + i * 80,
            "y": 450,
            "width": 50,
            "height": 50,
            "label": kind,
            "color": "#dce3ef",
            "blocks_seats": True,
            "appearance": {
                "pattern": "cross",
                "pattern_spacing": 8,
                "pattern_angle": 30,
                "icon_position": {"x": 0.2, "y": 0.3},
                "label_position": {"x": 0.6, "y": 0.7},
            },
        }
        for i, kind in enumerate(kinds)
    ]
    result = catalog.post(
        "/halls", headers=accounts["seller"], json={"name": "Мебель и стили", "layout": layout}
    )
    assert result.status_code == 201, result.text
    hall = result.json()
    event = catalog.post(
        "/organizer/events", headers=accounts["seller"], json={**concert["details"], "hall_id": hall["id"]}
    ).json()
    assert (
        catalog.post(f"/organizer/events/{event['id']}/publish", headers=accounts["seller"]).status_code
        == 200
    )
    snapshot = catalog.get(f"/widgets/{event['slug']}").json()["layout"]
    assert len(snapshot["seats"]) == len(concert["layout"]["seats"])
    assert [o["kind"] for o in snapshot["objects"]] == kinds
    assert snapshot["objects"][0]["appearance"]["icon_position"] == {"x": 0.2, "y": 0.3}
    library = catalog.get("/organizer/library", headers=accounts["other_seller"]).json()
    template = next(t for v in library["venues"] for t in v["templates"] if t["name"] == hall["name"])
    copied = catalog.post(
        f"/organizer/library/{template['id']}/copy", headers=accounts["other_seller"]
    ).json()
    copied["layout"]["objects"][0]["appearance"]["pattern"] = "none"
    assert (
        catalog.put(
            f"/halls/{copied['id']}",
            headers=accounts["other_seller"],
            json={"name": "Своя мебель", "layout": copied["layout"], "revision": copied["revision"]},
        ).status_code
        == 200
    )
    assert (
        catalog.get(f"/widgets/{event['slug']}").json()["layout"]["objects"][0]["appearance"]["pattern"]
        == "cross"
    )
    for invalid in [
        {"pattern_spacing": 0},
        {"pattern_color": "url(x)"},
        {"icon_position": {"x": 2, "y": 0}},
        {"pattern": "unknown"},
    ]:
        changed = deepcopy(layout)
        changed["objects"][0]["appearance"].update(invalid)
        assert (
            catalog.post(
                "/halls", headers=accounts["seller"], json={"name": "Ошибка", "layout": changed}
            ).status_code
            == 422
        )
