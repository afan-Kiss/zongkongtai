#!/usr/bin/env python3
"""Upload code to Aliyun and restart zhubo-control-center only (preserve .env)."""
from __future__ import annotations

import os
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/zhubo-control-center"

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".vite", "coverage", "logs", "tmp", "cache"}
SKIP_PARTS = {".env", "dev.db", "dev.db-journal", "__pycache__", "prod.db", "prod.db-journal"}


def load_env_password() -> str:
    if PASSWORD:
        return PASSWORD
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def connect() -> paramiko.SSHClient:
    pwd = load_env_password()
    if not pwd:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=pwd, timeout=60)
    return c


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> int:
    print(f"\n>>> {cmd[:200]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    return code


def should_skip(rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in SKIP_DIRS:
        return True
    for p in parts:
        if p in SKIP_DIRS:
            return True
    rel_l = rel.replace("\\", "/").lower()
    return any(x in rel_l for x in SKIP_PARTS)


def build_zip(zip_path: Path) -> None:
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in ROOT.rglob("*"):
            if not path.is_file():
                continue
            rel = str(path.relative_to(ROOT))
            if should_skip(rel):
                continue
            zf.write(path, rel)
            count += 1
    print(f"Packed {count} files")


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    sftp = client.open_sftp()
    try:
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def main() -> None:
    client = connect()
    try:
        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "control-center-inc.zip"
            build_zip(zip_path)
            run(client, "mkdir -p /tmp/control-upload")
            sftp_put(client, zip_path, "/tmp/control-upload/control-center-inc.zip")

        run(
            client,
            f"""
set -e
DEPLOY_DIR={DEPLOY_DIR}
ENV_BAK="/tmp/control-env-backup-$$.env"
DB_BAK="/tmp/control-prod-db-backup-$$.db"
if [ -f "$DEPLOY_DIR/.env" ]; then cp "$DEPLOY_DIR/.env" "$ENV_BAK"; fi
if [ -f "$DEPLOY_DIR/apps/control-server/prisma/prod.db" ]; then cp "$DEPLOY_DIR/apps/control-server/prisma/prod.db" "$DB_BAK"; fi
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
unzip -q /tmp/control-upload/control-center-inc.zip -d "$DEPLOY_DIR"
if [ -f "$ENV_BAK" ]; then cp "$ENV_BAK" "$DEPLOY_DIR/.env"; fi
if [ -f "$DB_BAK" ]; then mkdir -p "$DEPLOY_DIR/apps/control-server/prisma" && cp "$DB_BAK" "$DEPLOY_DIR/apps/control-server/prisma/prod.db"; fi
""",
        )

        code = run(
            client,
            f"""
set -e
cd {DEPLOY_DIR}
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
npm install
npm run build
cd apps/control-server
export DATABASE_URL="${{DATABASE_URL:-file:./prisma/prod.db}}"
npx prisma generate
npx prisma db push --accept-data-loss
cd {DEPLOY_DIR}
pm2 restart zhubo-control-center || pm2 start ecosystem.config.cjs
pm2 save
sleep 2
curl -sf http://127.0.0.1:4790/api/health
""",
        )
        if code != 0:
            sys.exit(code)
        print("\nIncremental deploy OK (zhubo-control-center restarted, .env preserved)")
    finally:
        client.close()


if __name__ == "__main__":
    main()
