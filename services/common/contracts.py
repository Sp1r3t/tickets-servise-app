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
    level_id: str = "ground"
    rotation: float = Field(default=0, ge=-360, le=360, allow_inf_nan=False)


class Point(StrictModel):
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)


class Appearance(StrictModel):
    pattern: Literal["auto", "none", "diagonal", "cross", "dots", "horizontal", "vertical"] = "auto"
    pattern_color: str = Field(default="#94a0b4", pattern=r"^#[0-9a-fA-F]{6}$")
    pattern_spacing: float = Field(default=12, ge=4, le=80, allow_inf_nan=False)
    pattern_angle: float = Field(default=45, ge=-180, le=180, allow_inf_nan=False)
    pattern_width: float = Field(default=1, ge=0.25, le=5, allow_inf_nan=False)
    outline_color: str = Field(default="#bac3d4", pattern=r"^#[0-9a-fA-F]{6}$")
    outline_width: float = Field(default=1, ge=0, le=6, allow_inf_nan=False)
    label_color: str = Field(default="#566074", pattern=r"^#[0-9a-fA-F]{6}$")
    label_size: float = Field(default=12, ge=6, le=40, allow_inf_nan=False)
    label_visible: bool = True
    icon_visible: bool = True
    details_visible: bool = True
    label_position: Point | None = None
    icon_position: Point | None = None


class Shape(StrictModel):
    x: float = Field(ge=0, le=2000, allow_inf_nan=False)
    y: float = Field(ge=0, le=1500, allow_inf_nan=False)
    width: float = Field(ge=10, le=2000, allow_inf_nan=False)
    height: float = Field(ge=10, le=1500, allow_inf_nan=False)
    label: str = Field(default="Объект", min_length=1, max_length=80)
    shape: Literal["rect", "ellipse", "polygon"] = "rect"
    points: list[Point] = Field(default_factory=list, max_length=64)
    rotation: float = Field(default=0, ge=-360, le=360, allow_inf_nan=False)
    level_id: str = "ground"
    appearance: Appearance | None = None

    @model_validator(mode="after")
    def contour(self):
        from services.common.geometry import validate_polygon

        if self.shape == "polygon":
            if len(self.points) < 3:
                raise ValueError("Для контура нужны хотя бы три вершины")
            validate_polygon([(p.x, p.y) for p in self.points])
        elif self.points:
            raise ValueError("Вершины разрешены только для свободного контура")
        return self


class Stage(Shape):
    width: float = Field(ge=60, le=2000, allow_inf_nan=False)
    height: float = Field(ge=30, le=1500, allow_inf_nan=False)
    label: str = Field(default="СЦЕНА", min_length=1, max_length=80)


class HallObject(Shape):
    id: str = Field(min_length=1, max_length=80)
    kind: Literal[
        "zone",
        "table",
        "bar",
        "column",
        "stairs",
        "entrance",
        "technical",
        "decoration",
        "sofa",
        "bench",
        "exit",
        "wc",
        "cloakroom",
        "lift",
        "sound",
        "light",
        "fence",
        "plant",
    ] = "zone"
    color: str = Field(default="#dce3ef", pattern=r"^#[0-9a-fA-F]{6}$")
    blocks_seats: bool = False
    variant: Literal[
        "plain", "straight", "corner", "double", "spiral", "island", "round", "square", "long"
    ] = "plain"


class Level(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)


class Layout(StrictModel):
    width: int = Field(default=1000, ge=300, le=2000)
    height: int = Field(default=700, ge=300, le=1500)
    stage: Stage
    categories: list[Category] = Field(min_length=1, max_length=20)
    seats: list[Seat] = Field(default_factory=list, max_length=5000)
    levels: list[Level] = Field(
        default_factory=lambda: [Level(id="ground", name="Партер")], min_length=1, max_length=12
    )
    objects: list[HallObject] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_geometry(self):
        from services.common.geometry import (
            circle_touches_polygon,
            circle_touches_ellipse,
            ellipse_bounds,
            outline,
        )

        categories = {c.id for c in self.categories}
        levels = {level.id for level in self.levels}
        if len(categories) != len(self.categories) or len(levels) != len(self.levels):
            raise ValueError("ID категорий и уровней должны быть уникальны")
        if len({obj.id for obj in self.objects}) != len(self.objects):
            raise ValueError("ID объектов должны быть уникальны")
        blockers = []
        for obj in [self.stage, *self.objects]:
            if obj.level_id not in levels:
                raise ValueError("Объект ссылается на неизвестный уровень")
            points = outline(obj)
            bounds = (
                ellipse_bounds(obj)
                if obj.shape == "ellipse"
                else (
                    min(x for x, y in points),
                    min(y for x, y in points),
                    max(x for x, y in points),
                    max(y for x, y in points),
                )
            )
            if (
                bounds[0] < -1e-7
                or bounds[1] < -1e-7
                or bounds[2] > self.width + 1e-7
                or bounds[3] > self.height + 1e-7
            ):
                raise ValueError("Сцена или объект выходит за границы зала")
            if obj is self.stage or obj.blocks_seats:
                blockers.append((obj, points, bounds))
        ids, labels, cells = set(), set(), {}
        for seat in self.seats:
            label = (seat.level_id, seat.section, seat.row, seat.number)
            if seat.id in ids or label in labels:
                raise ValueError("Повторяющиеся ID или номера мест")
            if seat.category_id not in categories or seat.level_id not in levels:
                raise ValueError("Место ссылается на неизвестную категорию или уровень")
            if seat.x + 12 > self.width or seat.y + 12 > self.height:
                raise ValueError("Место выходит за границы зала")
            for obj, points, bounds in blockers:
                if obj.level_id != seat.level_id or not (
                    bounds[0] - 12 < seat.x < bounds[2] + 12 and bounds[1] - 12 < seat.y < bounds[3] + 12
                ):
                    continue
                touches = (
                    circle_touches_ellipse(seat.x, seat.y, 12, obj)
                    if obj.shape == "ellipse"
                    else circle_touches_polygon(seat.x, seat.y, 12, points)
                )
                if touches:
                    raise ValueError("Место пересекает сцену или препятствие")
            cell = (seat.level_id, int(seat.x // 24), int(seat.y // 24))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for other in cells.get((cell[0], cell[1] + dx, cell[2] + dy), []):
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
    genre: Literal["live", "rock", "pop", "electronic", "jazz", "classical", "other"] = "live"
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
