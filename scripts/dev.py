"""Run five isolated service processes and a local HTTP gateway."""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--built", action="store_true", help="Serve frontend/dist on port 8000")
    args = parser.parse_args()
    os.chdir(ROOT)
    if not (ROOT / ".env").exists():
        subprocess.run([sys.executable, "scripts/init_env.py"], check=True)
    if args.built and not (ROOT / "frontend/dist/index.html").exists():
        sys.exit("Build the frontend first: cd frontend && pnpm build")
    for port in range(8000, 8006):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                sys.exit(f"Port {port} is already in use. Stop the existing process first.")
    processes = []

    def stop(*_):
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()

    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        for index, service in enumerate(["identity", "catalog", "inventory", "orders", "payments"], 1):
            processes.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        f"services.{service}.app:create_app",
                        "--factory",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(8000 + index),
                    ]
                )
            )
        processes.append(
            subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "services.gateway:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                ],
                env={**os.environ, "SERVE_FRONTEND": "1" if args.built else "0"},
            )
        )
        print("API: http://127.0.0.1:8000/api/health", flush=True)
        print("Web: http://127.0.0.1:8000" if args.built else "Web: start pnpm dev in frontend/", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(1)
        failed = next(process for process in processes if process.poll() is not None)
        sys.exit(f"A service exited with code {failed.returncode}")
    except KeyboardInterrupt:
        pass
    finally:
        stop()


if __name__ == "__main__":
    main()
