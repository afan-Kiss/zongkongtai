#!/usr/bin/env python3
"""Upload code to Aliyun and restart zhubo-control-center only (preserve .env + prod.db)."""
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
SERVER_DIR = f"{DEPLOY_DIR}/apps/control-server"
PROD_DB = f"{SERVER_DIR}/prod.db"
LEGACY_DB = f"{SERVER_DIR}/prisma/prod.db"
PUBLIC_HEALTH = f"http://{HOST}/control/api/health"


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


def check_nginx_upload_dir(client: paramiko.SSHClient) -> None:
    """检查 /var/lib/aa_nginx 父目录权限，不足 755 则修复（不重启 nginx）。"""
    run(
        client,
        r"""
set -e
DIR="/var/lib/aa_nginx"
if [ ! -d "$DIR" ]; then
  echo "nginx 上传目录不存在: $DIR"
  exit 0
fi
MODE=$(stat -c '%a' "$DIR" 2>/dev/null || echo unknown)
echo "当前权限 $DIR: $MODE"
NEED_FIX=0
if [ "$MODE" != "755" ] && [ "$MODE" != "775" ] && [ "$MODE" != "777" ]; then
  NEED_FIX=1
fi
# 770 等会导致 nginx worker 无法 traverse 父目录写 client_body
if [ "$MODE" = "770" ] || [ "$MODE" = "750" ] || [ "$MODE" = "700" ]; then
  NEED_FIX=1
fi
if [ "$NEED_FIX" = "1" ]; then
  echo "权限不足，执行 chmod 755 $DIR（不重启 nginx）"
  chmod 755 "$DIR"
  NEW_MODE=$(stat -c '%a' "$DIR")
  echo "修复后权限: $NEW_MODE"
else
  echo "权限正常，无需修复"
fi
""",
    )


def db_stats(client: paramiko.SSHClient, label: str) -> None:
    run(
        client,
        f"""
python3 - <<'PY'
import sqlite3, os
db = "{PROD_DB}"
if not os.path.isfile(db):
    print("{label}: prod.db 不存在")
else:
    con = sqlite3.connect(db)
    cur = con.cursor()
    def c(t):
        try:
            return cur.execute(f"select count(*) from {{t}}").fetchone()[0]
        except Exception:
            return "?"
    print("{label}: prod.db 存在", db)
    print("  SecretStore:", c("SecretStore"))
    print("  Project:", c("Project"))
    print("  Agent:", c("Agent"))
    con.close()
PY
""",
    )


def main() -> None:
    client = connect()
    try:
        print("=== 部署前 nginx 上传目录权限 ===")
        check_nginx_upload_dir(client)

        print("=== 部署前生产库检查 ===")
        db_stats(client, "部署前")

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
SERVER_DIR={SERVER_DIR}
PROD_DB={PROD_DB}
LEGACY_DB={LEGACY_DB}
ENV_BAK="/tmp/control-env-backup-$$.env"
DB_BAK="/tmp/control-prod-db-backup-$$.db"

if [ -f "$DEPLOY_DIR/.env" ]; then cp "$DEPLOY_DIR/.env" "$ENV_BAK"; fi

# 优先备份正确路径 apps/control-server/prod.db
if [ -f "$PROD_DB" ]; then
  cp "$PROD_DB" "$DB_BAK"
  echo "已备份生产库 apps/control-server/prod.db"
elif [ -f "$LEGACY_DB" ]; then
  cp "$LEGACY_DB" "$DB_BAK"
  echo "已从旧路径 prisma/prod.db 备份（将迁移到 apps/control-server/prod.db）"
fi

rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
unzip -q /tmp/control-upload/control-center-inc.zip -d "$DEPLOY_DIR"

if [ -f "$ENV_BAK" ]; then cp "$ENV_BAK" "$DEPLOY_DIR/.env"; fi
mkdir -p "$SERVER_DIR"
if [ -f "$DB_BAK" ]; then
  cp "$DB_BAK" "$PROD_DB"
  echo "已恢复生产库 apps/control-server/prod.db"
fi

# Prisma SQLite 路径相对 schema.prisma；生产必须用绝对路径指向 apps/control-server/prod.db
if [ -f "$DEPLOY_DIR/.env" ]; then
  if grep -q '^DATABASE_URL=' "$DEPLOY_DIR/.env"; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:$PROD_DB|" "$DEPLOY_DIR/.env"
  else
    echo "DATABASE_URL=file:$PROD_DB" >> "$DEPLOY_DIR/.env"
  fi
  echo "已统一 DATABASE_URL=file:$PROD_DB"
fi

# 清理误连的空 prisma/prod.db（真实库在 apps/control-server/prod.db）
if [ -f "$LEGACY_DB" ] && [ -f "$PROD_DB" ]; then
  LEG_SIZE=$(stat -c%s "$LEGACY_DB" 2>/dev/null || echo 0)
  PROD_SIZE=$(stat -c%s "$PROD_DB" 2>/dev/null || echo 0)
  if [ "$LEG_SIZE" -lt 10000 ] && [ "$PROD_SIZE" -gt 10000 ]; then
    rm -f "$LEGACY_DB" "$LEGACY_DB-wal" "$LEGACY_DB-shm"
    echo "已清理空的 prisma/prod.db"
  fi
fi
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
export DATABASE_URL="file:{PROD_DB}"
npx prisma generate
cd {DEPLOY_DIR}
npm run build -w @zhubo/control-shared
npm run build -w @zhubo/control-web
npm run build -w @zhubo/control-server
cd apps/control-server
if [ -s prod.db ]; then
  echo "未执行 db push，因为生产库已存在 apps/control-server/prod.db"
else
  echo "首次部署：创建空库 schema"
  npx prisma db push
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

        print("\n=== 部署后生产库检查 ===")
        db_stats(client, "部署后")
        print("\nIncremental deploy OK (zhubo-control-center restarted, prod.db preserved)")
    finally:
        client.close()


if __name__ == "__main__":
    main()
