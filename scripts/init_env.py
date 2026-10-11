"""Create local secrets once. Never overwrite an existing environment."""

import os
import secrets
from pathlib import Path

target = Path(__file__).resolve().parent.parent / ".env"
if target.exists():
    print(".env already exists; keeping current secrets")
else:
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as file:
        file.write(f"JWT_SECRET={secrets.token_urlsafe(48)}\nINTERNAL_SECRET={secrets.token_urlsafe(48)}\n")
        file.write("ENVIRONMENT=development\nDEMO_PAYMENTS=true\nCOOKIE_SECURE=false\nHOLD_SECONDS=600\n")
        for service in ("identity", "catalog", "inventory", "orders", "payments"):
            file.write(f"{service.upper()}_DB_PASSWORD={secrets.token_hex(24)}\n")
    print("Created .env with unique local secrets")
