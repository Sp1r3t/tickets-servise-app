"""Geometry shared by Catalog validation and Inventory snapshot validation."""

from math import cos, hypot, pi, sin, sqrt


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def intersects(a, b, c, d):
    def on_segment(p, q, r):
        return abs(cross(p, q, r)) < 1e-9 and all(
            min(p[i], q[i]) - 1e-9 <= r[i] <= max(p[i], q[i]) + 1e-9 for i in (0, 1)
        )

    return (cross(a, b, c) * cross(a, b, d) < 0 and cross(c, d, a) * cross(c, d, b) < 0) or any(
        (on_segment(a, b, c), on_segment(a, b, d), on_segment(c, d, a), on_segment(c, d, b))
    )


def validate_polygon(points):
    n = len(points)
    area = sum(cross((0, 0), points[i], points[(i + 1) % n]) for i in range(n))
    if abs(area) < 1e-6 or len(set(points)) != n:
        raise ValueError("Контур должен иметь площадь и разные вершины")
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            if intersects(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n]):
                raise ValueError("Контур не должен пересекать сам себя")


def outline(shape):
    if shape.shape == "polygon":
        points = [(p.x, p.y) for p in shape.points]
    elif shape.shape == "ellipse":
        points = [(0.5 + cos(i * pi / 64) / 2, 0.5 + sin(i * pi / 64) / 2) for i in range(128)]
    else:
        points = [(0, 0), (1, 0), (1, 1), (0, 1)]
    angle = shape.rotation * pi / 180
    return [
        (
            shape.x
            + shape.width / 2
            + (x - 0.5) * shape.width * cos(angle)
            - (y - 0.5) * shape.height * sin(angle),
            shape.y
            + shape.height / 2
            + (x - 0.5) * shape.width * sin(angle)
            + (y - 0.5) * shape.height * cos(angle),
        )
        for x, y in points
    ]


def circle_touches_polygon(x, y, radius, points):
    inside = False
    for a, b in zip(points, points[1:] + points[:1], strict=True):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = dx * dx + dy * dy
        t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) if length else 0
        if hypot(x - a[0] - t * dx, y - a[1] - t * dy) < radius:
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def ellipse_bounds(shape):
    angle = shape.rotation * pi / 180
    a, b = shape.width / 2, shape.height / 2
    dx = sqrt((a * cos(angle)) ** 2 + (b * sin(angle)) ** 2)
    dy = sqrt((a * sin(angle)) ** 2 + (b * cos(angle)) ** 2)
    cx, cy = shape.x + a, shape.y + b
    return cx - dx, cy - dy, cx + dx, cy + dy


def circle_touches_ellipse(x, y, radius, shape):
    # Rotate into ellipse coordinates. The nearest exterior point follows from
    # the Lagrange multiplier of u²/a² + v²/b² = 1; its root is monotonic.
    a, b = shape.width / 2, shape.height / 2
    dx, dy = x - shape.x - a, y - shape.y - b
    angle = -shape.rotation * pi / 180
    x, y = abs(dx * cos(angle) - dy * sin(angle)), abs(dx * sin(angle) + dy * cos(angle))
    if (x / a) ** 2 + (y / b) ** 2 <= 1:
        return True

    def boundary(multiplier):
        return (a * x / (multiplier + a * a)) ** 2 + (b * y / (multiplier + b * b)) ** 2

    lo, hi = 0, max(a * x, b * y, 1)
    while boundary(hi) > 1:
        hi *= 2
    for _ in range(50):
        mid = (lo + hi) / 2
        if boundary(mid) > 1:
            lo = mid
        else:
            hi = mid
    px, py = a * a * x / (hi + a * a), b * b * y / (hi + b * b)
    return hypot(x - px, y - py) < radius - 1e-8
