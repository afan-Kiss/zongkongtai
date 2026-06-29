"""Flask health 示例"""
import os
import time
from datetime import datetime, timezone

from flask import Flask, jsonify

app = Flask(__name__)
STARTED_AT = time.time()


@app.get("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "我的项目",
            "version": "0.0.0",
            "time": datetime.now(timezone.utc).isoformat(),
            "uptime": int(time.time() - STARTED_AT),
            "env": os.getenv("FLASK_ENV", "development"),
        }
    )
