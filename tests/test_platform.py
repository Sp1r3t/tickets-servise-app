from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlalchemy import select, update

from services.common.contracts import Layout
from services.common.core import now
from services.inventory.app import holds, stock
from services.orders.app import orders
from services.payments.app import payments


def make_order(platform, accounts, concert, key="request-0001", seats=None, buyer="buyer"):
    return platform["clients"]["orders"].post(
        "/orders",
        json={"event_id": concert["id"], "seat_ids": seats or ["seat-1"]},
        headers={**accounts[buyer], "Idempotency-Key": key},
    )


def checkout(platform, accounts, order):
    payment = platform["clients"]["orders"].post(f"/orders/{order['id']}/checkout", headers=accounts["buyer"])
    assert payment.status_code == 200, payment.text
    return payment.json()


def test_complete_purchase_and_single_entry(platform, accounts, concert):
    order = make_order(platform, accounts, concert, seats=["seat-1", "seat-2"]).json()
    assert order["state"] == "pending" and order["amount"] == 500000
    payment = checkout(platform, accounts, order)
    assert payment["provider"] == "demo" and not payment["real_money"]
    assert (
        platform["clients"]["payments"]
        .post(f"/payments/{payment['id']}/confirm", headers=accounts["buyer"])
        .status_code
        == 200
    )
    paid = platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).json()
    assert paid["state"] == "paid" and len(paid["tickets"]) == 2
    repeat = platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).json()
    assert repeat["tickets"] == paid["tickets"]

    def scan():
        return platform["clients"]["orders"].post(
            "/tickets/scan", json={"code": paid["tickets"][0]["code"]}, headers=accounts["seller"]
        )

    assert scan().status_code == 200
    assert scan().status_code == 409
    sales = (
        platform["clients"]["orders"]
        .get(f"/organizer/events/{concert['id']}/sales", headers=accounts["seller"])
        .json()
    )
    assert sales == {"sold": 2, "pending": 0, "checked_in": 1, "revenue": 500000}


def test_concurrent_buyers_cannot_sell_same_seat(platform, accounts, concert):
    def reserve(index):
        response = make_order(
            platform,
            accounts,
            concert,
            key=f"concurrent-{index}",
            buyer="buyer" if index % 2 else "other_buyer",
        )
        assert response.status_code == 201, response.text
        return response.json()["state"]

    with ThreadPoolExecutor(max_workers=8) as pool:
        states = list(pool.map(reserve, range(20)))
    assert states.count("pending") == 1
    assert states.count("failed") == 19


def test_bundle_reservation_is_atomic(platform, accounts, concert):
    assert make_order(platform, accounts, concert).json()["state"] == "pending"
    conflicting = make_order(
        platform, accounts, concert, key="conflict-0001", seats=["seat-1", "seat-2"], buyer="other_buyer"
    ).json()
    assert conflicting["state"] == "failed"
    states = platform["clients"]["inventory"].get(f"/inventory/{concert['id']}").json()["seats"]
    assert next(s for s in states if s["id"] == "seat-2")["state"] == "available"


def test_idempotency_reuses_order_and_rejects_changed_body(platform, accounts, concert):
    first = make_order(platform, accounts, concert).json()
    repeated = make_order(platform, accounts, concert).json()
    assert repeated["id"] == first["id"]
    assert make_order(platform, accounts, concert, seats=["seat-2"]).status_code == 409
    assert checkout(platform, accounts, first)["id"] == checkout(platform, accounts, first)["id"]


def test_missing_idempotency_and_invalid_seats(platform, accounts, concert):
    client = platform["clients"]["orders"]
    assert (
        client.post(
            "/orders", headers=accounts["buyer"], json={"event_id": concert["id"], "seat_ids": ["seat-1"]}
        ).status_code
        == 422
    )
    assert make_order(platform, accounts, concert, seats=["seat-1", "seat-1"]).status_code == 422
    assert make_order(platform, accounts, concert, seats=["seat-5"]).json()["state"] == "failed"
    assert (
        make_order(platform, accounts, concert, key="nonexistent-1", seats=["unknown"]).json()["state"]
        == "failed"
    )


def test_ownership_and_internal_api_protection(platform, accounts, concert):
    order = make_order(platform, accounts, concert).json()
    client = platform["clients"]["orders"]
    assert client.get(f"/orders/{order['id']}", headers=accounts["other_buyer"]).status_code == 404
    assert client.post(f"/orders/{order['id']}/checkout", headers=accounts["other_buyer"]).status_code == 404
    assert (
        platform["clients"]["catalog"]
        .put(
            f"/halls/{concert['hall']['id']}",
            json={"name": "Чужой зал", "layout": concert["hall"]["layout"], "revision": 1},
            headers=accounts["other_seller"],
        )
        .status_code
        == 404
    )
    assert platform["clients"]["catalog"].get("/halls", headers=accounts["buyer"]).status_code == 403
    assert (
        platform["clients"]["inventory"]
        .post("/internal/holds/some-id/commit", headers=accounts["buyer"])
        .status_code
        == 403
    )
    payment = checkout(platform, accounts, order)
    assert (
        platform["clients"]["payments"]
        .post(f"/payments/{payment['id']}/confirm", headers=accounts["other_buyer"])
        .status_code
        == 404
    )


def test_expired_holds_can_be_reclaimed_without_background_worker(platform, accounts, concert):
    first = make_order(platform, accounts, concert).json()
    with platform["apps"]["inventory"].state.runtime.transaction() as conn:
        conn.execute(update(holds).where(holds.c.id == first["id"]).values(expires_at=now() - 1))
        conn.execute(update(stock).where(stock.c.hold_id == first["id"]).values(expires_at=now() - 1))
    second = make_order(platform, accounts, concert, key="reclaimed-0001", buyer="other_buyer").json()
    assert second["state"] == "pending"
    with platform["apps"]["orders"].state.runtime.transaction() as conn:
        conn.execute(update(orders).where(orders.c.id == first["id"]).values(expires_at=now() - 1))
    platform["apps"]["orders"].state.sweep()
    first = platform["clients"]["orders"].get(f"/orders/{first['id']}", headers=accounts["buyer"]).json()
    assert first["state"] == "expired"
    available = platform["clients"]["inventory"].get(f"/inventory/{concert['id']}").json()["seats"]
    assert next(s for s in available if s["id"] == "seat-1")["state"] == "held"


def test_payment_after_hold_expiry_is_compensated(platform, accounts, concert):
    order = make_order(platform, accounts, concert).json()
    payment = checkout(platform, accounts, order)
    platform["clients"]["payments"].post(f"/payments/{payment['id']}/confirm", headers=accounts["buyer"])
    with platform["apps"]["inventory"].state.runtime.transaction() as conn:
        conn.execute(update(holds).where(holds.c.id == order["id"]).values(expires_at=now() - 1))
    result = platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).json()
    assert result["state"] == "refunded" and not result["tickets"]
    assert (
        platform["call"]("payments", "GET", f"/internal/payments/order/{order['id']}")["state"] == "refunded"
    )


def test_cancel_persists_intent_if_release_response_is_lost(platform, accounts, concert):
    order = make_order(platform, accounts, concert).json()
    payment = checkout(platform, accounts, order)
    original = platform["call"]

    def fail_once(service, method, path, body=None):
        result = original(service, method, path, body)
        if path.endswith("/release"):
            platform["apps"]["orders"].state.runtime.call = original
            raise HTTPException(503, "Simulated response loss")
        return result

    platform["apps"]["orders"].state.runtime.call = fail_once
    assert (
        platform["clients"]["orders"]
        .post(f"/orders/{order['id']}/cancel", headers=accounts["buyer"])
        .status_code
        == 503
    )
    with platform["apps"]["orders"].state.runtime.engine.connect() as conn:
        assert (
            conn.execute(select(orders.c.state).where(orders.c.id == order["id"])).scalar_one()
            == "cancelling"
        )
    platform["apps"]["orders"].state.sweep()
    assert (
        platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).json()["state"]
        == "cancelled"
    )
    assert (
        platform["clients"]["payments"]
        .post(f"/payments/{payment['id']}/confirm", headers=accounts["buyer"])
        .status_code
        == 409
    )


@pytest.mark.parametrize("step", ["reserve", "commit"])
def test_recover_after_inventory_response_loss(platform, accounts, concert, step):
    original = platform["call"]

    def lose_response(service, method, path, body=None):
        result = original(service, method, path, body)
        target = path == "/internal/holds" if step == "reserve" else path.endswith("/commit")
        if service == "inventory" and target:
            platform["apps"]["orders"].state.runtime.call = original
            raise HTTPException(503, "Simulated response loss")
        return result

    if step == "reserve":
        platform["apps"]["orders"].state.runtime.call = lose_response
        assert make_order(platform, accounts, concert).status_code == 503
    order = make_order(platform, accounts, concert).json()
    assert order["state"] == "pending"
    payment = checkout(platform, accounts, order)
    platform["clients"]["payments"].post(f"/payments/{payment['id']}/confirm", headers=accounts["buyer"])
    if step == "commit":
        platform["apps"]["orders"].state.runtime.call = lose_response
        assert (
            platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).status_code
            == 503
        )
    platform["apps"]["orders"].state.sweep()
    result = platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).json()
    assert result["state"] == "paid" and len(result["tickets"]) == 1


def test_hall_revision_and_immutable_published_snapshot(platform, accounts, concert):
    catalog = platform["clients"]["catalog"]
    hall = concert["hall"]
    body = {"name": hall["name"], "revision": hall["revision"], "layout": deepcopy(hall["layout"])}
    body["layout"]["categories"][0]["price"] = 900000
    assert catalog.put(f"/halls/{hall['id']}", json=body, headers=accounts["seller"]).status_code == 200
    assert catalog.put(f"/halls/{hall['id']}", json=body, headers=accounts["seller"]).status_code == 409
    widget = catalog.get(f"/widgets/{concert['slug']}").json()
    assert widget["layout"]["categories"][0]["price"] == 250000
    assert make_order(platform, accounts, concert).json()["amount"] == 250000
    assert (
        catalog.put(
            f"/organizer/events/{concert['id']}", json=concert["details"], headers=accounts["seller"]
        ).status_code
        == 409
    )


def test_layout_checks_geometry_numbering_and_prices(concert):
    layout = deepcopy(concert["layout"])
    layout["seats"][1]["x"] = layout["seats"][0]["x"]
    with pytest.raises(ValueError, match="пересекаются"):
        Layout.model_validate(layout)
    layout = deepcopy(concert["layout"])
    layout["seats"][0]["x"] = 350
    layout["seats"][0]["y"] = 80
    with pytest.raises(ValueError, match="сцену"):
        Layout.model_validate(layout)
    layout = deepcopy(concert["layout"])
    layout["seats"][1]["number"] = "1"
    with pytest.raises(ValueError, match="Повторяющиеся"):
        Layout.model_validate(layout)
    layout = deepcopy(concert["layout"])
    layout["categories"][0]["price"] = -100
    with pytest.raises(ValueError):
        Layout.model_validate(layout)


def test_refresh_rotates_and_logout_revokes(platform):
    client = platform["clients"]["identity"]
    client.post(
        "/auth/register",
        json={"email": "fresh@example.com", "name": "Test", "password": "CorrectPassword123!"},
    )
    old = client.cookies.get("tf_refresh")
    refreshed = client.post("/auth/refresh", headers={"Cookie": f"tf_refresh={old}"})
    assert refreshed.status_code == 200
    new = refreshed.cookies.get("tf_refresh")
    assert old != new
    assert client.post("/auth/refresh", headers={"Cookie": f"tf_refresh={old}"}).status_code == 401
    assert client.post("/auth/logout", headers={"Cookie": f"tf_refresh={new}"}).status_code == 200
    assert client.post("/auth/refresh", headers={"Cookie": f"tf_refresh={new}"}).status_code == 401


def test_client_cannot_set_price_or_fake_payment(platform, accounts, concert):
    response = platform["clients"]["orders"].post(
        "/orders",
        json={"event_id": concert["id"], "seat_ids": ["seat-1"], "amount": 1},
        headers={**accounts["buyer"], "Idempotency-Key": "tampered-0001"},
    )
    assert response.status_code == 422
    order = make_order(platform, accounts, concert).json()
    payment = checkout(platform, accounts, order)
    with platform["apps"]["payments"].state.runtime.transaction() as conn:
        conn.execute(
            update(payments).where(payments.c.id == payment["id"]).values(state="succeeded", amount=1)
        )
    assert (
        platform["clients"]["orders"].get(f"/orders/{order['id']}", headers=accounts["buyer"]).status_code
        == 409
    )
