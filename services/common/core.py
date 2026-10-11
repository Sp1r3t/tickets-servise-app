"""Infrastructure only. Business state belongs to exactly one service."""

import hashlib
import hmac
import logging
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import httpx
import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, event, text

log = logging.getLogger("ticketflow")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    jwt_secret: str
    internal_secret: str
    database_url: str = ""
    data_dir: str = ".data"
    environment: str = "development"
    cookie_secure: bool = False
    demo_payments: bool = True
    hold_seconds: int = 600
    identity_url: str = "http://127.0.0.1:8001"
    catalog_url: str = "http://127.0.0.1:8002"
    inventory_url: str = "http://127.0.0.1:8003"
    orders_url: str = "http://127.0.0.1:8004"
    payments_url: str = "http://127.0.0.1:8005"

    def checked(self):
        if min(len(self.jwt_secret), len(self.internal_secret)) < 32:
            raise RuntimeError("JWT_SECRET and INTERNAL_SECRET must contain at least 32 characters")
        if self.environment == "production" and (self.demo_payments or not self.cookie_secure):
            raise RuntimeError("Production requires real payment integration and secure cookies")
        if not 30 <= self.hold_seconds <= 3600:
            raise RuntimeError("HOLD_SECONDS must be between 30 and 3600")
        return self


def uid():
    return str(uuid.uuid4())


def fingerprint(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


class Runtime:
    def __init__(self, name, metadata, settings=None):
        self.name = name
        self.settings = (settings or Settings()).checked()
        Path(self.settings.data_dir).mkdir(parents=True, exist_ok=True)
        url = self.settings.database_url or f"sqlite:///{self.settings.data_dir}/{name}.db"
        self.sqlite = url.startswith("sqlite")
        self.engine = create_engine(
            url,
            pool_pre_ping=True,
            connect_args={"check_same_thread": False, "timeout": 30} if self.sqlite else {},
        )
        if self.sqlite:

            @event.listens_for(self.engine, "connect")
            def configure(dbapi_connection, _):
                dbapi_connection.execute("PRAGMA foreign_keys=ON")
                dbapi_connection.execute("PRAGMA journal_mode=WAL")

            metadata.create_all(self.engine)

    @contextmanager
    def transaction(self):
        # SQLite development equivalent of serialized writes; PostgreSQL uses row locks below.
        with self.engine.connect() as conn:
            if self.sqlite:
                conn.exec_driver_sql("BEGIN IMMEDIATE")
            else:
                conn.begin()
            try:
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise

    def call(self, service, method, path, body=None):
        try:
            response = httpx.request(
                method,
                getattr(self.settings, f"{service}_url") + path,
                json=body,
                headers={"X-Internal-Key": self.settings.internal_secret},
                timeout=8,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Сервис временно недоступен. Повторите запрос.") from exc
        if response.is_error:
            try:
                detail = response.json().get("detail", "Ошибка зависимого сервиса")
            except ValueError:
                detail = "Ошибка зависимого сервиса"
            raise HTTPException(response.status_code if response.status_code < 500 else 503, detail)
        return response.json()

    def internal(self, x_internal_key: str = Header(default="")):
        if not hmac.compare_digest(x_internal_key, self.settings.internal_secret):
            raise HTTPException(403, "Внутренний API")

    def user_dependency(self):
        bearer = HTTPBearer(auto_error=False)

        def current_user(auth: HTTPAuthorizationCredentials | None = Depends(bearer)):
            try:
                if not auth:
                    raise jwt.InvalidTokenError()
                payload = jwt.decode(
                    auth.credentials,
                    self.settings.jwt_secret,
                    algorithms=["HS256"],
                    audience="ticketflow-api",
                    issuer="ticketflow-identity",
                    options={"require": ["exp", "iat", "sub", "aud", "iss"]},
                )
                return payload
            except jwt.InvalidTokenError as exc:
                raise HTTPException(401, "Войдите в аккаунт") from exc

        return current_user


def base_app(name, runtime, lifespan=None):
    app = FastAPI(title=f"Ticketflow · {name}", version="0.1.0", lifespan=lifespan)
    app.state.runtime = runtime

    @app.middleware("http")
    async def request_context(request, call_next):
        request_id = uid()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    def health():
        with runtime.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"service": name, "status": "ok"}

    return app


def one(conn, query, message="Объект не найден"):
    row = conn.execute(query).mappings().first()
    if not row:
        raise HTTPException(404, message)
    return dict(row)


def locked(query):
    return query.with_for_update()


def now():
    return int(time.time())
