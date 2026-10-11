import secrets

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, HTTPException, Request, Response
from pydantic import EmailStr, Field
from sqlalchemy import Column, Integer, MetaData, String, Table, delete, insert, select, update
from sqlalchemy.exc import IntegrityError

from services.common.contracts import StrictModel
from services.common.core import Runtime, base_app, fingerprint, locked, now, one, uid

metadata = MetaData()
users = Table(
    "users",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("email", String(180), unique=True, nullable=False),
    Column("name", String(100), nullable=False),
    Column("password_hash", String(255), nullable=False),
    Column("role", String(20), nullable=False),
    Column("created_at", Integer, nullable=False),
)
sessions = Table(
    "sessions",
    metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("user_id", String(36), nullable=False),
    Column("expires_at", Integer, nullable=False),
)
attempts = Table(
    "attempts",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("count", Integer, nullable=False),
    Column("until", Integer, nullable=False),
)
hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))


class Register(StrictModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)
    role: str = Field(default="buyer", pattern="^(buyer|organizer)$")


class Login(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def create_app(settings=None):
    rt = Runtime("identity", metadata, settings)
    app = base_app("identity", rt)
    current_user = rt.user_dependency()

    def issue(conn, user, response):
        token = secrets.token_urlsafe(48)
        conn.execute(
            insert(sessions).values(
                token_hash=fingerprint(token), user_id=user["id"], expires_at=now() + 30 * 86400
            )
        )
        response.set_cookie(
            "tf_refresh",
            token,
            httponly=True,
            secure=rt.settings.cookie_secure,
            samesite="lax",
            path="/api/v1/auth",
            max_age=30 * 86400,
        )
        access = jwt.encode(
            {
                "sub": user["id"],
                "role": user["role"],
                "name": user["name"],
                "iat": now(),
                "exp": now() + 900,
                "aud": "ticketflow-api",
                "iss": "ticketflow-identity",
            },
            rt.settings.jwt_secret,
            algorithm="HS256",
        )
        return {
            "access_token": access,
            "token_type": "bearer",
            "expires_in": 900,
            "user": {k: user[k] for k in ("id", "email", "name", "role")},
        }

    @app.post("/auth/register", status_code=201)
    def register(body: Register, response: Response):
        data = {
            "id": uid(),
            "email": str(body.email).lower(),
            "name": body.name,
            "role": body.role,
            "password_hash": hasher.hash(body.password),
            "created_at": now(),
        }
        try:
            with rt.transaction() as conn:
                conn.execute(insert(users).values(**data))
                return issue(conn, data, response)
        except IntegrityError as exc:
            raise HTTPException(409, "Этот email уже зарегистрирован") from exc

    @app.post("/auth/login")
    def login(body: Login, response: Response):
        key = fingerprint(str(body.email).lower())
        with rt.transaction() as conn:
            previous = conn.execute(locked(select(attempts).where(attempts.c.key == key))).mappings().first()
            if previous and previous["until"] > now() and previous["count"] >= 10:
                raise HTTPException(429, "Слишком много попыток. Повторите через 15 минут.")
            if not previous:
                conn.execute(insert(attempts).values(key=key, count=1, until=now() + 900))
            else:
                conn.execute(
                    update(attempts)
                    .where(attempts.c.key == key)
                    .values(
                        count=previous["count"] + 1 if previous["until"] > now() else 1,
                        until=previous["until"] if previous["until"] > now() else now() + 900,
                    )
                )
        with rt.transaction() as conn:
            user = (
                conn.execute(select(users).where(users.c.email == str(body.email).lower())).mappings().first()
            )
            try:
                hasher.verify(user["password_hash"] if user else DUMMY_HASH, body.password)
            except VerificationError as exc:
                raise HTTPException(401, "Неверный email или пароль") from exc
            if not user:
                raise HTTPException(401, "Неверный email или пароль")
            conn.execute(delete(attempts).where(attempts.c.key == key))
            return issue(conn, user, response)

    @app.post("/auth/refresh")
    def refresh(request: Request, response: Response):
        digest = fingerprint(request.cookies.get("tf_refresh", ""))
        with rt.transaction() as conn:
            session = (
                conn.execute(locked(select(sessions).where(sessions.c.token_hash == digest)))
                .mappings()
                .first()
            )
            if not session or session["expires_at"] <= now():
                raise HTTPException(401, "Сессия истекла")
            user = one(conn, select(users).where(users.c.id == session["user_id"]))
            conn.execute(delete(sessions).where(sessions.c.token_hash == digest))
            return issue(conn, user, response)

    @app.post("/auth/logout")
    def logout(request: Request, response: Response):
        with rt.transaction() as conn:
            conn.execute(
                delete(sessions).where(
                    sessions.c.token_hash == fingerprint(request.cookies.get("tf_refresh", ""))
                )
            )
        response.delete_cookie("tf_refresh", path="/api/v1/auth")
        return {"ok": True}

    @app.get("/auth/me")
    def me(user=Depends(current_user)):
        with rt.engine.connect() as conn:
            row = one(conn, select(users).where(users.c.id == user["sub"]))
        return {k: row[k] for k in ("id", "email", "name", "role")}

    return app
