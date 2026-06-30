"""阿里云总控运维公共配置 — 生产路径与进程名统一在此维护。"""

SERVER_HOST = "8.137.126.18"
CONTROL_ROOT = "/www/wwwroot/zhubo-control-center"
CONTROL_SERVER_DIR = "/www/wwwroot/zhubo-control-center/apps/control-server"
CONTROL_DB = "/www/wwwroot/zhubo-control-center/apps/control-server/prod.db"
CONTROL_PM2 = "zhubo-control-center"
ANALYSIS_PM2 = "zhubo-analysis"
NGINX_TMP_DIR = "/var/lib/aa_nginx"
NGINX_CLIENT_BODY = f"{NGINX_TMP_DIR}/tmp/client_body"

# 旧路径：仅 diagnose-db-path-conflict.py 用于排查，不是正式库
LEGACY_DB = f"{CONTROL_SERVER_DIR}/prisma/prod.db"

CONTROL_ENTRY = f"http://{SERVER_HOST}/control/"
CONTROL_HEALTH = f"{CONTROL_ENTRY}api/health"
