import importlib
import os
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from services.common.core import Settings

NAMES = ("identity", "catalog", "inventory", "orders", "payments")


@pytest.fixture
def platform(tmp_path):
    apps, clients = {}, {}
    admin_url = os.environ.get("TEST_POSTGRES_URL")
    databases = []
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT") if admin_url else None
    try:
        for name in NAMES:
            module = importlib.import_module(f"services.{name}.app")
            database_url = ""
            if admin:
                dbname = f"test_{name}_{uuid.uuid4().hex[:12]}"
                with admin.connect() as conn:
                    conn.exec_driver_sql(f'CREATE DATABASE "{dbname}"')
                databases.append(dbname)
                database_url = str(admin.url.set(database=dbname).render_as_string(hide_password=False))
                # Apply the actual immutable initial migration SQL, not metadata.create_all.
                migration = importlib.import_module("migrations.versions.0001_initial")
                engine = create_engine(database_url)
                with engine.begin() as conn:
                    for sql in migration.SCHEMAS[name]:
                        conn.exec_driver_sql(sql)
                engine.dispose()
            settings = Settings(
                _env_file=None,
                jwt_secret="test-jwt-" + "x" * 40,
                internal_secret="test-internal-" + "y" * 40,
                data_dir=str(tmp_path),
                database_url=database_url,
            )
            apps[name] = module.create_app(settings)
            clients[name] = TestClient(apps[name])

        def call(service, method, path, body=None):
            response = clients[service].request(
                method, path, json=body, headers={"X-Internal-Key": "test-internal-" + "y" * 40}
            )
            if response.is_error:
                raise HTTPException(response.status_code, response.json().get("detail"))
            return response.json()

        for app in apps.values():
            app.state.runtime.call = call
        yield {"apps": apps, "clients": clients, "call": call}
    finally:
        for client in clients.values():
            client.close()
        for app in apps.values():
            app.state.runtime.engine.dispose()
        if admin:
            with admin.connect() as conn:
                for dbname in databases:
                    conn.exec_driver_sql(f'DROP DATABASE "{dbname}" WITH (FORCE)')
            admin.dispose()


@pytest.fixture
def accounts(platform):
    result = {}
    for key, role in [
        ("seller", "organizer"),
        ("other_seller", "organizer"),
        ("buyer", "buyer"),
        ("other_buyer", "buyer"),
    ]:
        response = platform["clients"]["identity"].post(
            "/auth/register",
            json={
                "email": f"{key}@example.com",
                "name": key,
                "password": "CorrectPassword123!",
                "role": role,
            },
        )
        assert response.status_code == 201, response.text
        result[key] = {"Authorization": "Bearer " + response.json()["access_token"]}
    return result


@pytest.fixture
def concert(platform, accounts):
    from datetime import datetime, timedelta, timezone

    layout = {
        "width": 1000,
        "height": 700,
        "stage": {"x": 300, "y": 40, "width": 400, "height": 70, "label": "СЦЕНА"},
        "categories": [{"id": "standard", "name": "Стандарт", "color": "#6960e8", "price": 250000}],
        "seats": [
            {
                "id": f"seat-{i}",
                "x": 250 + i * 40,
                "y": 200,
                "section": "Партер",
                "row": "1",
                "number": str(i),
                "category_id": "standard",
                "blocked": i == 5,
                "accessible": i == 4,
            }
            for i in range(1, 6)
        ],
    }
    catalog = platform["clients"]["catalog"]
    hall = catalog.post("/halls", json={"name": "Тестовый зал", "layout": layout}, headers=accounts["seller"])
    assert hall.status_code == 201, hall.text
    start = datetime.now(timezone.utc) + timedelta(days=30)
    details = {
        "title": "Тестовый концерт",
        "artist": "Музыкант",
        "description": "Описание программы тестового концерта для зрителей.",
        "starts_at": start.isoformat(),
        "doors_at": (start - timedelta(hours=1)).isoformat(),
        "timezone": "Europe/Moscow",
        "city": "Москва",
        "venue": "Клуб",
        "address": "Москва, улица Тестовая, 1",
        "age_limit": 16,
        "organizer_name": "Организатор",
        "contact_email": "seller@example.com",
        "refund_policy": "По вопросам возврата обратитесь к организатору по указанному email.",
        "hall_id": hall.json()["id"],
    }
    event = catalog.post("/organizer/events", json=details, headers=accounts["seller"])
    assert event.status_code == 201, event.text
    published = catalog.post(f"/organizer/events/{event.json()['id']}/publish", headers=accounts["seller"])
    assert published.status_code == 200, published.text
    return {**published.json(), "hall": hall.json()}
