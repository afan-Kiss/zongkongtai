#!/usr/bin/env python3
"""Upload code to Aliyun and restart zhubo-control-center only (preserve .env)."""
from __future__ import annotations

import os
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

from pack_filter import scan_tree, is_sensitive, _rel

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/zhubo-control-center"
PUBLIC_HEALTH = f"http://{HOST}/control/api/health"

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
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    if out.strip():
        print(out.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    if err.strip():
        print(err.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    return code


def build_zip(zip_path: Path) -> None:
    include, excluded, sensitive_excluded = scan_tree(ROOT)
    leaks = [_rel(p, ROOT) for p in include if is_sensitive(_rel(p, ROOT))]
    if leaks:
        print("ERROR: 敏感文件将进入上传包:", file=sys.stderr)
        for hit in leaks[:20]:
            print(f"  - {hit}", file=sys.stderr)
        sys.exit(1)
    print(
        f"本次将上传 {len(include)} 个文件，已排除 {excluded} 个（其中敏感 {sensitive_excluded} 个）"
    )
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in include:
            rel = str(path.relative_to(ROOT))
            zf.write(path, rel)
    print(f"Packed {len(include)} files")


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
npm install -w @zhubo/control-shared -w @zhubo/control-web -w @zhubo/control-server
cd apps/control-server
export DATABASE_URL="${{DATABASE_URL:-file:./prisma/prod.db}}"
npx prisma generate
cd {DEPLOY_DIR}
npm run build -w @zhubo/control-shared
npm run build -w @zhubo/control-web
npm run build -w @zhubo/control-server
cd apps/control-server
if [ ! -s prisma/prod.db ]; then
  npx prisma db push --accept-data-loss
  set -a && . {DEPLOY_DIR}/.env && set +a
  npx tsx prisma/seed.ts || true
fi
cd {DEPLOY_DIR}
pm2 delete zhubo-control-center 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 3
curl -sf {PUBLIC_HEALTH}
""",
        )
        if code != 0:
            sys.exit(code)
        print("\nIncremental deploy OK (zhubo-control-center restarted, .env preserved)")
    finally:
        client.close()


if __name__ == "__main__":
    main()
