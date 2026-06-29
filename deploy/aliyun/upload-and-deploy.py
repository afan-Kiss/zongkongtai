#!/usr/bin/env python3
"""Upload zhubo-control-center to Aliyun. Requires SSH_PASS env."""
from __future__ import annotations

import os
import secrets
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
SKIP_PARTS = {".env", "dev.db", "dev.db-journal", "__pycache__"}


def connect() -> paramiko.SSHClient:
    if not PASSWORD:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=60)
    return c


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> int:
    print(f"\n>>> {cmd[:180]}")
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


def build_env() -> str:
    enc_key = secrets.token_urlsafe(32)
    session = secrets.token_urlsafe(48)
    service = secrets.token_urlsafe(32)
    agent = secrets.token_urlsafe(24)
    admin_pass = os.environ.get("ADMIN_PASSWORD", secrets.token_urlsafe(16))
    return f"""NODE_ENV=production
HOST=127.0.0.1
PORT=4790
DATABASE_URL=file:./prisma/prod.db
SESSION_SECRET={session}
SECRET_ENCRYPTION_KEY={enc_key}
SERVICE_TOKEN={service}
AGENT_TOKEN={agent}
ADMIN_USERNAME=admin
ADMIN_PASSWORD={admin_pass}
"""


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    sftp = client.open_sftp()
    try:
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def main() -> None:
    client = connect()
    deploy_env_content = ""
    try:
        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "control-center.zip"
            env_path = Path(td) / "server.env"
            build_zip(zip_path)
            deploy_env_content = build_env()
            env_path.write_text(deploy_env_content, encoding="utf-8")

            run(client, f"mkdir -p {DEPLOY_DIR}/logs /tmp/control-upload")
            sftp_put(client, zip_path, "/tmp/control-upload/control-center.zip")
            sftp_put(client, env_path, "/tmp/control-upload/server.env")

        run(
            client,
            f"""
set -e
DEPLOY_DIR={DEPLOY_DIR}
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
unzip -q /tmp/control-upload/control-center.zip -d "$DEPLOY_DIR"
cp /tmp/control-upload/server.env "$DEPLOY_DIR/.env"
sed -i 's/\\r$//' "$DEPLOY_DIR/deploy/aliyun/deploy.sh"
chmod +x "$DEPLOY_DIR"/deploy/aliyun/deploy.sh
""",
        )
        code = run(client, f"cd {DEPLOY_DIR} && bash deploy/aliyun/deploy.sh")
        if code != 0:
            sys.exit(code)

        nginx = (ROOT / "deploy/aliyun/nginx-control-center.conf").read_text(encoding="utf-8")
        aa_conf = f"""server {{
    listen 4880;
    server_name {HOST};

    client_max_body_size 20m;

    location / {{
        proxy_pass http://127.0.0.1:4790;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }}

    access_log /www/wwwlogs/zhubo-control-center.access.log;
    error_log /www/wwwlogs/zhubo-control-center.error.log;
}}
"""
        run(
            client,
            f"cat > /etc/aa_nginx/conf.d/zhubo-control-center.conf << 'NGXEOF'\n{aa_conf}\nNGXEOF\n/usr/sbin/aa_nginx -t && systemctl reload aa_nginx\niptables -C INPUT -p tcp --dport 4880 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 4880 -j ACCEPT",
        )
        run(client, "curl -sf http://127.0.0.1:4790/api/health")
        run(client, "curl -sf --max-time 10 http://127.0.0.1:4880/api/health || true")
        run(client, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh && pm2 status | grep control || pm2 status")

        creds_path = ROOT / "deploy-output-credentials.txt"
        creds_path.write_text(
            f"访问地址: http://{HOST}:4880\n"
            f"内网地址: http://127.0.0.1:4790\n"
            f"PM2名称: zhubo-control-center\n"
            f"部署目录: {DEPLOY_DIR}\n"
            f"登录账号: admin\n"
            f"登录密码: 见服务器 .env 中 ADMIN_PASSWORD\n"
            f"Agent Token: 见服务器 .env 中 AGENT_TOKEN\n"
            f"Service Token: 见服务器 .env 中 SERVICE_TOKEN\n",
            encoding="utf-8",
        )
        print(f"\nCredentials summary written to {creds_path}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
