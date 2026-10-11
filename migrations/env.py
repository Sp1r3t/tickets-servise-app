import importlib
import os

from alembic import context
from sqlalchemy import create_engine

service = os.environ["SERVICE_NAME"]
if service not in ("identity", "catalog", "inventory", "orders", "payments"):
    raise RuntimeError("Unknown SERVICE_NAME")
target_metadata = importlib.import_module(f"services.{service}.app").metadata
url = os.environ["DATABASE_URL"]
if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with create_engine(url).connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
