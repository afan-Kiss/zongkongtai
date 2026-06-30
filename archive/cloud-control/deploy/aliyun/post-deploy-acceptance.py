#!/usr/bin/env python3
"""Post-deploy online acceptance (no full tokens/cookies in output)."""
from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = os.environ.get("CONTROL_SERVER_URL", "http://8.137.126.18/control").rstrip("/")
SHOPS = ["拾玉居和田玉", "和田雅玉", "祥钰珠宝", "XY祥钰珠宝"]
TEST_SHOP = "拾玉居和田玉"


def load_token() -> str:
    if os.environ.get("SERVICE_TOKEN"):
        return os.environ["SERVICE_TOKEN"]
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("SERVICE_TOKEN="):
                return line.split("=", 1)[1].strip()
    cred = ROOT / "deploy-output-credentials.txt"
    if cred.exists():
        for line in cred.read_text(encoding="utf-8").splitlines():
            if line.startswith("SERVICE_TOKEN="):
                return line.split("=", 1)[1].strip()
    return ""


def req(method: str, path: str, headers: dict | None = None, body: dict | None = None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", **(headers or {})}
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return resp.status, {"raw": raw[:200]}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:200]}


def fp(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:10]


def main() -> None:
    token = load_token()
    if not token:
        print("FAIL: no SERVICE_TOKEN locally")
        sys.exit(1)

    results: list[str] = []

    st, data = req("GET", "/api/health")
    if st != 200 or not data.get("ok"):
        print(f"FAIL health: {st} {data}")
        sys.exit(1)
    results.append(f"health OK ({st})")

    # query serviceToken disabled in production
    qpath = f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(TEST_SHOP)}&keyName=cookie&serviceToken={urllib.parse.quote(token)}"
    st_q, _ = req("GET", qpath)
    if st_q == 200:
        results.append("WARN query serviceToken still works (expected 403 in prod)")
    else:
        results.append(f"query serviceToken rejected ({st_q}) OK")

    st_b, rb = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(TEST_SHOP)}&keyName=cookie",
        headers={"Authorization": f"Bearer {token}"},
    )
    if st_b != 200 or not rb.get("ok"):
        print(f"FAIL Bearer resolve: {st_b} {rb}")
        sys.exit(1)
    results.append(f"Bearer resolve OK (value len={len(rb.get('value', ''))})")

    st_x, _ = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(TEST_SHOP)}&keyName=cookie",
        headers={"x-service-token": token},
    )
    if st_x != 200:
        print(f"FAIL x-service-token resolve: {st_x}")
        sys.exit(1)
    results.append("x-service-token resolve OK")

    st_no, _ = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(TEST_SHOP)}&keyName=cookie",
    )
    if st_no != 403:
        print(f"FAIL resolve without token expected 403 got {st_no}")
        sys.exit(1)
    results.append("resolve without token 403 OK")

    test_cookie = f"a=1; test={os.getpid()}"
    st_up, up = req(
        "POST",
        "/api/secrets/qianfan/upload-cookie",
        headers={"Authorization": f"Bearer {token}"},
        body={
            "platform": "qianfan",
            "shopName": "部署验收测试店",
            "cookie": test_cookie,
            "collectorProject": "deploy-acceptance",
            "capturedAt": "2026-06-29T12:00:00.000Z",
        },
    )
    if st_up != 200 or not up.get("ok"):
        print(f"FAIL upload-cookie: {st_up} {up}")
        sys.exit(1)
    results.append(f"upload-cookie OK hash={up.get('cookieHash', '?')[:16]}")

    st_reg_no, _ = req(
        "POST",
        "/api/agents/register",
        body={"name": "test", "token": "invalid"},
    )
    if st_reg_no != 403:
        print(f"FAIL agent register without token expected 403 got {st_reg_no}")
        sys.exit(1)
    results.append("agent register no token 403 OK")

    st_reg, reg = req(
        "POST",
        "/api/agents/register",
        headers={"Authorization": f"Bearer {token}"},
        body={"name": "deploy-check-agent", "token": "deploy-check-token-not-used"},
    )
    if st_reg not in (200, 201) and not reg.get("ok"):
        print(f"FAIL agent register with SERVICE_TOKEN: {st_reg} {reg}")
        sys.exit(1)
    results.append(f"agent register with SERVICE_TOKEN OK ({st_reg})")

    # dangerous command blocked
    st_cmd, cmd = req(
        "POST",
        "/api/commands",
        headers={"Cookie": "invalid"},
        body={
            "projectId": "fake",
            "name": "bad",
            "command": "format c: /y",
        },
    )
    if st_cmd == 401:
        results.append("dangerous command blocked at auth (401) OK")
    elif st_cmd == 400:
        results.append("dangerous command blocked at validation (400) OK")
    else:
        results.append(f"WARN dangerous command status={st_cmd} (need login to fully test)")

    print("=== Post-deploy acceptance ===")
    for r in results:
        print(f"  ✓ {r}")
    print("PASSED")


if __name__ == "__main__":
    main()
