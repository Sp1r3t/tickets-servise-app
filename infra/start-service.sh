#!/bin/sh
set -eu
alembic upgrade head
exec uvicorn "services.${SERVICE_NAME}.app:create_app" --factory --host 0.0.0.0 --port 8000
