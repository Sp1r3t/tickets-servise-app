"""Local gateway. Production routes and rate limits live in infra/nginx.conf."""

import os

import httpx
from fastapi import FastAPI, HTTPException, Request, Response

app = FastAPI(title="Ticketflow · local gateway")
ROUTES = {
    "auth": 8001,
    "halls": 8002,
    "events": 8002,
    "widgets": 8002,
    "inventory": 8003,
    "orders": 8004,
    "tickets": 8004,
    "payments": 8005,
}


@app.api_route("/api/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    prefix = path.split("/")[0]
    if prefix == "organizer":
        port = 8004 if path.endswith("/sales") else 8002
    else:
        port = ROUTES.get(prefix)
    if not port:
        raise HTTPException(404, "Маршрут не найден")
    content = await request.body()
    if len(content) > 2_000_000:
        raise HTTPException(413, "Слишком большой запрос")
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() in ("authorization", "content-type", "cookie", "idempotency-key")
    }
    try:
        async with httpx.AsyncClient() as client:
            upstream = await client.request(
                request.method,
                f"http://127.0.0.1:{port}/{path}",
                params=request.query_params,
                content=content,
                headers=headers,
                timeout=30,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Сервис временно недоступен") from exc
    response = Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )
    for name in ("set-cookie", "x-request-id", "cache-control", "x-content-type-options"):
        if name in upstream.headers:
            response.headers[name] = upstream.headers[name]
    return response


@app.get("/api/health")
async def health():
    results = {}
    async with httpx.AsyncClient() as client:
        for name, port in [
            ("identity", 8001),
            ("catalog", 8002),
            ("inventory", 8003),
            ("orders", 8004),
            ("payments", 8005),
        ]:
            try:
                response = await client.get(f"http://127.0.0.1:{port}/health", timeout=2)
                results[name] = response.status_code == 200
            except httpx.HTTPError:
                results[name] = False
    return Response(
        content=__import__("json").dumps(results),
        status_code=200 if all(results.values()) else 503,
        media_type="application/json",
    )


if os.environ.get("SERVE_FRONTEND") == "1":
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from pathlib import Path

    dist = Path(__file__).resolve().parent.parent / "frontend/dist"
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        return FileResponse(dist / "index.html")
