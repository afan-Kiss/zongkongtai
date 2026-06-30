#!/usr/bin/env python3
"""Pre-deploy: verify server .env has required production keys (no secret values printed)."""
from __future__ import annotations

import base64
import hashlib
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
ENV_PATH = "/www/wwwroot/zhubo-control-center/.env"

REQUIRED = [
    "NODE_ENV",
    "DATABASE_URL",
    "SESSION_SECRET",
    "SECRET_ENCRYPTION_KEY",
    "SERVICE_TOKEN",
    "AGENT_TOKEN",
    "ADMIN_PASSWORD",
]


def load_ssh_pass() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if pwd:
        return pwd
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        print("FAIL: Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)
    try:
        _, stdout, _ = c.exec_command(f"cat {ENV_PATH} 2>/dev/null || true", timeout=30)
        raw = stdout.read().decode("utf-8", errors="replace")
        if not raw.strip():
            print(f"FAIL: {ENV_PATH} not found or empty")
            sys.exit(1)

        env = parse_env(raw)
        missing = [k for k in REQUIRED if not env.get(k)]
        if missing:
            print(f"FAIL: missing keys: {', '.join(missing)}")
            sys.exit(1)

        if env.get("NODE_ENV") != "production":
            print(f"FAIL: NODE_ENV={env.get('NODE_ENV')} (expected production)")
            sys.exit(1)

        if env.get("ADMIN_PASSWORD") == "Zhubo@2026!":
            print("FAIL: ADMIN_PASSWORD is default Zhubo@2026!")
            sys.exit(1)

        try:
            padded = env["SECRET_ENCRYPTION_KEY"] + "=" * (-len(env["SECRET_ENCRYPTION_KEY"]) % 4)
            key_buf = base64.b64decode(padded)
        except Exception:
            print("FAIL: SECRET_ENCRYPTION_KEY is not valid base64")
            sys.exit(1)
        if len(key_buf) != 32:
            print(f"FAIL: SECRET_ENCRYPTION_KEY length={len(key_buf)} (expected 32 bytes)")
            sys.exit(1)

        print("OK: server .env pre-check passed")
        print(f"  NODE_ENV=production")
        print(f"  DATABASE_URL=set ({len(env['DATABASE_URL'])} chars)")
        print(f"  SESSION_SECRET=set fp={fingerprint(env['SESSION_SECRET'])}")
        print(f"  SECRET_ENCRYPTION_KEY=valid 32-byte base64 fp={fingerprint(env['SECRET_ENCRYPTION_KEY'])}")
        print(f"  SERVICE_TOKEN=set fp={fingerprint(env['SERVICE_TOKEN'])}")
        print(f"  AGENT_TOKEN=set fp={fingerprint(env['AGENT_TOKEN'])}")
        print(f"  ADMIN_PASSWORD=set fp={fingerprint(env['ADMIN_PASSWORD'])}")
    finally:
        c.close()


if __name__ == "__main__":
    main()
