"""Explicit, repeatable development demo; does not execute automatically."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.common.core import Settings

if Settings().environment != "development":
    sys.exit("Demo seed is allowed only in development")

BASE = "http://127.0.0.1:8000/api/v1"
PASSWORD = "DemoTicketflow2026!"


def account(email, name, role):
    result = httpx.post(
        BASE + "/auth/register", json={"email": email, "name": name, "role": role, "password": PASSWORD}
    )
    if result.status_code == 409:
        result = httpx.post(BASE + "/auth/login", json={"email": email, "password": PASSWORD})
    result.raise_for_status()
    return {"Authorization": "Bearer " + result.json()["access_token"]}


organizer = account("organizer@example.com", "Live Music Studio", "organizer")
account("buyer@example.com", "Алексей", "buyer")
existing = httpx.get(BASE + "/organizer/events", headers=organizer).json()
if existing:
    print("Demo accounts are ready; keeping existing concerts")
    sys.exit(0)
layout = {
    "width": 1000,
    "height": 700,
    "stage": {"x": 300, "y": 45, "width": 400, "height": 75, "label": "СЦЕНА"},
    "categories": [
        {"id": "standard", "name": "Стандарт", "color": "#6960e8", "price": 250000},
        {"id": "premium", "name": "Премиум", "color": "#e6a344", "price": 450000},
    ],
    "seats": [
        {
            "id": f"r{r}-s{n}",
            "x": 235 + n * 34,
            "y": 155 + r * 42,
            "row": str(r),
            "number": str(n),
            "section": "Партер",
            "category_id": "premium" if r <= 2 else "standard",
            "accessible": r == 8 and n in (1, 2),
            "blocked": False,
        }
        for r in range(1, 9)
        for n in range(1, 15)
    ],
}
hall = httpx.post(
    BASE + "/halls", headers=organizer, json={"name": "Камерный зал · 112 мест", "layout": layout}
)
hall.raise_for_status()
start = (datetime.now(timezone.utc) + timedelta(days=30)).replace(hour=16, minute=0, second=0, microsecond=0)
event = httpx.post(
    BASE + "/organizer/events",
    headers=organizer,
    json={
        "title": "Ночь живой музыки",
        "artist": "Neon Collective",
        "description": "Живой звук, камерная атмосфера и любимые композиции. Специальная концертная программа Neon Collective в уютном зале.",
        "starts_at": start.isoformat(),
        "doors_at": (start - timedelta(hours=1)).isoformat(),
        "timezone": "Europe/Moscow",
        "city": "Москва",
        "venue": "Live Hall",
        "address": "Москва, улица Музыкальная, 12",
        "age_limit": 16,
        "organizer_name": "Live Music Studio",
        "contact_email": "organizer@example.com",
        "poster_url": None,
        "refund_policy": "Это демонстрационный концерт. По вопросам тестовых билетов обращайтесь к организатору. Реальные деньги не списываются.",
        "hall_id": hall.json()["id"],
    },
)
event.raise_for_status()
published = httpx.post(
    BASE + f"/organizer/events/{event.json()['id']}/publish", headers=organizer, timeout=30
)
published.raise_for_status()
print(f"Demo widget: http://127.0.0.1:8000/widget/{published.json()['slug']}")
print(f"Demo accounts: organizer@example.com / buyer@example.com; password: {PASSWORD}")
