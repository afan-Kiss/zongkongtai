#!/usr/bin/env python3
"""Upload zhubo-control-center to Aliyun. Preserves existing server .env tokens."""
from __future__ import annotations

import os
import re
import secrets
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

from pack_filter import scan_tree


ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/zhubo-control-center"
PUBLIC_HEALTH = f"http://{HOST}/control/api/health"

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".vite", "coverage", "logs", "tmp", "cache"}
SKIP_PARTS = {".env", "dev.db", "dev.db-journal", "__pycache__", "prod.db", "prod.db-journal"}


def connect() -> paramiko.SSHClient:
    if not PASSWORD:
        local_env = ROOT / ".env"
        if local_env.exists():
            for line in local_env.read_text(encoding="utf-8").splitlines():
                if line.startswith("SSH_PASS="):
                    globals()["PASSWORD"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not PASSWORD:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=60)
    return c


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> tuple[int, str, str]:
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
    return code, out, err


def build_zip(zip_path: Path) -> None:
    include, excluded, sensitive_hits = scan_tree(ROOT)
    if sensitive_hits:
        print("ERROR: 发现不应上传的敏感文件:", file=sys.stderr)
        for hit in sensitive_hits[:20]:
            print(f"  - {hit}", file=sys.stderr)
        sys.exit(1)
    print(f"本次将上传 {len(include)} 个文件，已排除 {excluded} 个（含构建产物/敏感项）")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in include:
            rel = str(path.relative_to(ROOT))
            zf.write(path, rel)
    print(f"Packed {len(include)} files")


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def merge_env(existing: dict[str, str]) -> str:
    """Keep existing secrets; only generate missing keys on first deploy."""
    keys = {
        "NODE_ENV": "production",
        "HOST": "127.0.0.1",
        "PORT": "4790",
        "DATABASE_URL": "file:./prisma/prod.db",
        "SESSION_SECRET": secrets.token_urlsafe(48),
        "SECRET_ENCRYPTION_KEY": secrets.token_urlsafe(32),
        "SERVICE_TOKEN": secrets.token_urlsafe(32),
        "AGENT_TOKEN": secrets.token_urlsafe(24),
        "ADMIN_USERNAME": "admin",
        "ADMIN_PASSWORD": os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(16),
        "COOKIE_SECURE": "false",
    }
    merged = {**keys, **{k: v for k, v in existing.items() if v}}
    lines = [f"{k}={merged[k]}" for k in keys]
    if "COOKIE_SECURE" in merged:
        lines.append(f"COOKIE_SECURE={merged['COOKIE_SECURE']}")
    return "\n".join(lines) + "\n"


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    sftp = client.open_sftp()
    try:
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def read_remote_env(client: paramiko.SSHClient) -> dict[str, str]:
    _, out, _ = run(client, f"cat {DEPLOY_DIR}/.env 2>/dev/null || true", timeout=30)
    return parse_env(out)


def main() -> None:
    client = connect()
    try:
        existing_env = read_remote_env(client)
        if existing_env.get("SERVICE_TOKEN"):
            print("Found existing server .env — preserving SERVICE_TOKEN / AGENT_TOKEN / secrets")

        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "control-center.zip"
            env_path = Path(td) / "server.env"
            build_zip(zip_path)
            env_path.write_text(merge_env(existing_env), encoding="utf-8")

            run(client, "mkdir -p /tmp/control-upload")
            sftp_put(client, zip_path, "/tmp/control-upload/control-center.zip")
            sftp_put(client, env_path, "/tmp/control-upload/server.env")

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
unzip -q /tmp/control-upload/control-center.zip -d "$DEPLOY_DIR"
if [ -f "$ENV_BAK" ]; then cp "$ENV_BAK" "$DEPLOY_DIR/.env"; else cp /tmp/control-upload/server.env "$DEPLOY_DIR/.env"; fi
if [ -f "$DB_BAK" ]; then mkdir -p "$DEPLOY_DIR/apps/control-server/prisma" && cp "$DB_BAK" "$DEPLOY_DIR/apps/control-server/prisma/prod.db"; fi
sed -i 's/\\r$//' "$DEPLOY_DIR/deploy/aliyun/deploy.sh"
chmod +x "$DEPLOY_DIR"/deploy/aliyun/deploy.sh
""",
        )

        code, _, _ = run(client, f"cd {DEPLOY_DIR} && bash deploy/aliyun/deploy.sh")
        if code != 0:
            sys.exit(code)

        # Do NOT create 4880 nginx — formal entry is http://HOST/control/
        run(client, "curl -sf http://127.0.0.1:4790/api/health")
        pub_code, pub_out, _ = run(client, f"curl -sf --max-time 15 {PUBLIC_HEALTH} || echo PUBLIC_FAIL")
        if "PUBLIC_FAIL" in pub_out or pub_code != 0:
            print(f"WARN: public health check failed — verify Nginx /control/ manually: {PUBLIC_HEALTH}")

        run(client, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status | grep control || pm2 status")

        creds_path = ROOT / "deploy-output-credentials.txt"
        env_final = read_remote_env(client)
        creds_path.write_text(
            f"正式访问: http://{HOST}/control/\n"
            f"健康检查: http://{HOST}/control/api/health\n"
            f"内网地址: http://127.0.0.1:4790\n"
            f"PM2名称: zhubo-control-center\n"
            f"部署目录: {DEPLOY_DIR}\n"
            f"登录账号: {env_final.get('ADMIN_USERNAME', 'admin')}\n"
            f"ADMIN_PASSWORD={env_final.get('ADMIN_PASSWORD', '(见服务器 .env)')}\n"
            f"AGENT_TOKEN={env_final.get('AGENT_TOKEN', '(见服务器 .env)')}\n"
            f"SERVICE_TOKEN={env_final.get('SERVICE_TOKEN', '(见服务器 .env)')}\n"
            f"\n本地 Agent 连接:\n"
            f"CONTROL_SERVER_URL=http://{HOST}/control\n",
            encoding="utf-8",
        )
        print(f"\nCredentials summary written to {creds_path}")
        print(f"Deploy OK — verify: {PUBLIC_HEALTH}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
