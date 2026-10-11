from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Category(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    price: int = Field(ge=100, le=100_000_000)  # minor units, never floats


class Seat(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    x: float = Field(ge=12, le=1988, allow_inf_nan=False)
    y: float = Field(ge=12, le=1488, allow_inf_nan=False)
    row: str = Field(min_length=1, max_length=30)
    number: str = Field(min_length=1, max_length=30)
    section: str = Field(min_length=1, max_length=80)
    category_id: str
    accessible: bool = False
    blocked: bool = False


class Stage(StrictModel):
    x: float = Field(ge=0, le=1800, allow_inf_nan=False)
    y: float = Field(ge=0, le=1300, allow_inf_nan=False)
    width: float = Field(ge=60, le=2000, allow_inf_nan=False)
    height: float = Field(ge=30, le=1500, allow_inf_nan=False)
    label: str = Field(default="СЦЕНА", min_length=1, max_length=80)


class Layout(StrictModel):
    width: int = Field(default=1000, ge=300, le=2000)
    height: int = Field(default=700, ge=300, le=1500)
    stage: Stage
    categories: list[Category] = Field(min_length=1, max_length=20)
    seats: list[Seat] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def validate_geometry(self):
        categories = {c.id for c in self.categories}
        if len(categories) != len(self.categories):
            raise ValueError("ID категорий должны быть уникальны")
        if self.stage.x + self.stage.width > self.width or self.stage.y + self.stage.height > self.height:
            raise ValueError("Сцена выходит за границы зала")
        ids, labels, cells = set(), set(), {}
        for seat in self.seats:
            label = (seat.section, seat.row, seat.number)
            if seat.id in ids or label in labels:
                raise ValueError("Повторяющиеся ID или номера мест")
            if seat.category_id not in categories:
                raise ValueError("Место ссылается на неизвестную категорию")
            if seat.x + 12 > self.width or seat.y + 12 > self.height:
                raise ValueError("Место выходит за границы зала")
            s = self.stage
            if s.x - 12 < seat.x < s.x + s.width + 12 and s.y - 12 < seat.y < s.y + s.height + 12:
                raise ValueError("Место пересекает сцену")
            cell = (int(seat.x // 24), int(seat.y // 24))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for other in cells.get((cell[0] + dx, cell[1] + dy), []):
                        if (seat.x - other.x) ** 2 + (seat.y - other.y) ** 2 < 24**2:
                            raise ValueError("Места пересекаются: расстояние должно быть не меньше 24")
            cells.setdefault(cell, []).append(seat)
            ids.add(seat.id)
            labels.add(label)
        return self


class HallInput(StrictModel):
    name: str = Field(min_length=2, max_length=150)
    layout: Layout
    revision: int = Field(default=0, ge=0)


class EventInput(StrictModel):
    title: str = Field(min_length=3, max_length=180)
    artist: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=20, max_length=10000)
    starts_at: datetime
    doors_at: datetime
    timezone: str = "Europe/Moscow"
    city: str = Field(min_length=2, max_length=120)
    venue: str = Field(min_length=2, max_length=180)
    address: str = Field(min_length=5, max_length=250)
    age_limit: Literal[0, 6, 12, 16, 18] = 16
    poster_url: HttpUrl | None = None
    organizer_name: str = Field(min_length=2, max_length=180)
    contact_email: str = Field(min_length=5, max_length=180)
    refund_policy: str = Field(min_length=20, max_length=3000)
    hall_id: str

    @field_validator("contact_email")
    @classmethod
    def email(cls, value):
        from pydantic import TypeAdapter, EmailStr

        return str(TypeAdapter(EmailStr).validate_python(value))

    @model_validator(mode="after")
    def times(self):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Неизвестный часовой пояс") from exc
        if self.starts_at.tzinfo is None or self.doors_at.tzinfo is None:
            raise ValueError("Дата должна содержать часовой пояс")
        if self.doors_at > self.starts_at:
            raise ValueError("Открытие дверей должно быть до начала концерта")
        return self
