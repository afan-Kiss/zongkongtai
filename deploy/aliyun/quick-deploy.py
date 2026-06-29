#!/usr/bin/env python3
"""Quick deploy: upload changed server/web dist and restart PM2 only."""
from __future__ import annotations

import os
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except Exception:
    pass

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/zhubo-control-center"


def connect() -> paramiko.SSHClient:
    if not PASSWORD:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=60)
    return c


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> int:
    print(f"\n>>> {cmd[:160]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    if out.strip():
        print(out.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    if err.strip():
        print(err.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    return code


def main() -> None:
    client = connect()
    try:
        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "patch.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for rel in [
                    "apps/control-server/dist",
                    "apps/control-server/prisma/schema.prisma",
                    "apps/control-server/src",
                    "apps/control-web/dist",
                    "packages/control-shared/dist",
                    "ecosystem.config.cjs",
                    "package.json",
                ]:
                    p = ROOT / rel
                    if p.is_dir():
                        for f in p.rglob("*"):
                            if f.is_file():
                                zf.write(f, str(f.relative_to(ROOT)).replace("\\", "/"))
                    elif p.is_file():
                        zf.write(p, rel.replace("\\", "/"))
            sftp = client.open_sftp()
            sftp.put(str(zip_path), "/tmp/control-patch.zip")
            sftp.close()

        run(
            client,
            f"""
set -e
cd {DEPLOY_DIR}
unzip -oq /tmp/control-patch.zip
cd apps/control-server
export DATABASE_URL="${{DATABASE_URL:-file:./prisma/prod.db}}"
npx prisma db push --accept-data-loss
npx prisma generate
cd {DEPLOY_DIR}
pm2 restart zhubo-control-center
sleep 2
curl -sf http://127.0.0.1:4790/api/health
curl -sf http://127.0.0.1/control/api/health
""",
        )
        run(client, "curl -sf http://127.0.0.1/api/health")
    finally:
        client.close()


if __name__ == "__main__":
    main()
