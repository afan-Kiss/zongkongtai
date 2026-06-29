"""FastAPI health 示例"""
from datetime import datetime, timezone
import os
import time

STARTED_AT = time.time()


def health_payload(service: str, version: str = "0.0.0") -> dict:
    return {
        "ok": True,
        "service": service,
        "version": version,
        "time": datetime.now(timezone.utc).isoformat(),
        "uptime": int(time.time() - STARTED_AT),
        "env": os.getenv("ENV", "development"),
    }


# 在 FastAPI app 中：
# @app.get("/api/health")
# def health():
#     return health_payload("我的项目")
