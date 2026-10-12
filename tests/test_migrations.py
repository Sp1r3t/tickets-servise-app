import importlib

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


@pytest.mark.parametrize("service", ["identity", "catalog", "inventory", "orders", "payments"])
def test_upgrade_from_initial_schema_preserves_existing_data(service, tmp_path, monkeypatch):
    monkeypatch.setenv("SERVICE_NAME", service)
    url = f"sqlite:///{tmp_path}/{service}.db"
    config = Config("alembic.ini")
    config.attributes.update(service_name=service, database_url=url)
    command.upgrade(config, "0001")
    engine = create_engine(url)
    try:
        if service == "catalog":
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO halls (id,owner_id,name,layout,revision,updated_at) VALUES ('old-hall','old-owner','Старый зал','{}',1,1)"
                    )
                )
        command.upgrade(config, "head")
        actual = inspect(engine)
        expected = importlib.import_module(f"services.{service}.app").metadata
        assert set(actual.get_table_names()) == set(expected.tables) | {"alembic_version"}
        for table in expected.tables.values():
            assert {c["name"] for c in actual.get_columns(table.name)} == {c.name for c in table.columns}
        if service == "catalog":
            with engine.connect() as conn:
                assert (
                    conn.execute(text("SELECT name FROM halls WHERE id='old-hall'")).scalar_one()
                    == "Старый зал"
                )
    finally:
        engine.dispose()
