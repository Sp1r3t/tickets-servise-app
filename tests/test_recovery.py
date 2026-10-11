from fastapi import HTTPException
from sqlalchemy import update

from services.common.core import now
from services.inventory.app import event_stock
from tests.test_platform import make_order


def test_publication_resumes_exact_saved_snapshot(platform, accounts, concert):
    catalog = platform["clients"]["catalog"]
    created = catalog.post("/organizer/events", json=concert["details"], headers=accounts["seller"]).json()
    original = platform["call"]

    def lose_response(service, method, path, body=None):
        result = original(service, method, path, body)
        if service == "inventory" and path == "/internal/events":
            platform["apps"]["catalog"].state.runtime.call = original
            raise HTTPException(503, "Lost publication response")
        return result

    platform["apps"]["catalog"].state.runtime.call = lose_response
    assert (
        catalog.post(f"/organizer/events/{created['id']}/publish", headers=accounts["seller"]).status_code
        == 503
    )
    visible = catalog.get("/organizer/events", headers=accounts["seller"]).json()
    assert next(e for e in visible if e["id"] == created["id"])["status"] == "publishing"
    assert catalog.get(f"/widgets/{created['slug']}").status_code == 404
    resumed = catalog.post(f"/organizer/events/{created['id']}/publish", headers=accounts["seller"])
    assert resumed.status_code == 200 and resumed.json()["status"] == "published"
    assert resumed.json()["layout"] == concert["layout"]


def test_sales_close_at_concert_start(platform, accounts, concert):
    with platform["apps"]["inventory"].state.runtime.transaction() as conn:
        conn.execute(
            update(event_stock).where(event_stock.c.event_id == concert["id"]).values(sales_end=now() - 1)
        )
    assert not platform["clients"]["inventory"].get(f"/inventory/{concert['id']}").json()["sales_open"]
    assert make_order(platform, accounts, concert).json()["state"] == "failed"


def test_demo_disabled_never_creates_fake_real_payment(platform):
    app = platform["apps"]["payments"]
    app.state.runtime.settings.demo_payments = False
    result = platform["clients"]["payments"].post(
        "/internal/payments",
        json={
            "order_id": "demo-disabled",
            "buyer_id": "buyer",
            "amount": 100,
            "currency": "RUB",
            "expires_at": now() + 600,
        },
        headers={"X-Internal-Key": "test-internal-" + "y" * 40},
    )
    assert result.status_code == 503


def test_login_attempts_are_limited_without_revealing_account(platform):
    client = platform["clients"]["identity"]
    for _ in range(10):
        assert (
            client.post(
                "/auth/login", json={"email": "nobody@example.com", "password": "incorrect"}
            ).status_code
            == 401
        )
    assert (
        client.post("/auth/login", json={"email": "nobody@example.com", "password": "incorrect"}).status_code
        == 429
    )
