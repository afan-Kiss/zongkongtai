#!/usr/bin/env python3
"""Full online acceptance after deploy (no secrets in output)."""
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
BASE = "http://8.137.126.18/control"
SHOPS = ["拾玉居和田玉", "和田雅玉", "祥钰珠宝", "XY祥钰珠宝"]


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    cred = ROOT / "deploy-output-credentials.txt"
    if cred.exists():
        for line in cred.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip(), v.strip())
    return out


def req(method: str, path: str, headers: dict | None = None, body: dict | None = None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", **(headers or {})}
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=25) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:300]}


def fp(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:10]


def main() -> None:
    env = load_env()
    token = env.get("SERVICE_TOKEN", "")
    admin = env.get("ADMIN_USERNAME", "admin")
    password = ""
    cred = ROOT / "deploy-output-credentials.txt"
    if cred.exists():
        for line in cred.read_text(encoding="utf-8").splitlines():
            if line.startswith("ADMIN_PASSWORD="):
                password = line.split("=", 1)[1].strip()
    if not password:
        password = env.get("ADMIN_PASSWORD", "")

    lines: list[str] = []

    st, h = req("GET", "/api/health")
    lines.append(f"health: {st} ok={h.get('ok')}")

    if not token:
        print("FAIL: no SERVICE_TOKEN")
        sys.exit(1)

    st_q, _ = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(SHOPS[0])}&keyName=cookie&serviceToken={urllib.parse.quote(token)}",
    )
    lines.append(f"query serviceToken: {st_q} ({'disabled OK' if st_q != 200 else 'STILL WORKS'})")

    st_b, rb = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(SHOPS[0])}&keyName=cookie",
        headers={"Authorization": f"Bearer {token}"},
    )
    lines.append(f"Bearer resolve: {st_b} hasValue={bool(rb.get('value'))}")

    st_x, _ = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(SHOPS[0])}&keyName=cookie",
        headers={"x-service-token": token},
    )
    lines.append(f"x-service-token resolve: {st_x}")

    st_no, _ = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(SHOPS[0])}&keyName=cookie",
    )
    lines.append(f"resolve no token: {st_no} ({'OK' if st_no == 403 else 'FAIL'})")

    st_reg_no, _ = req("POST", "/api/agents/register", body={"name": "x", "token": "y"})
    lines.append(f"agent register no auth: {st_reg_no} ({'OK' if st_reg_no in (401, 403) else 'FAIL'})")

    st_reg, reg = req(
        "POST",
        "/api/agents/register",
        headers={"Authorization": f"Bearer {token}"},
        body={"name": "deploy-accept", "token": "deploy-token-placeholder"},
    )
    lines.append(f"agent register Bearer SERVICE_TOKEN: {st_reg} ok={reg.get('ok')}")

    test_cookie = "deploy-test=1; xhsTrackerId=accept"
    st_up, up = req(
        "POST",
        "/api/secrets/qianfan/upload-cookie",
        headers={"Authorization": f"Bearer {token}"},
        body={
            "platform": "qianfan",
            "shopName": "部署验收测试店",
            "cookie": test_cookie,
            "collectorProject": "deploy-acceptance",
        },
    )
    lines.append(f"upload-cookie Bearer: {st_up} ok={up.get('ok')}")

    # login session for secrets list
    login = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=json.dumps({"username": admin, "password": password}).encode(),
        headers={"Content-Type": "application/json", "Origin": "http://8.137.126.18"},
        method="POST",
    )
    cookie_header = ""
    try:
        with urllib.request.urlopen(login, timeout=20) as resp:
            cookies = resp.headers.get_all("Set-Cookie") or []
            cookie_header = "; ".join(c.split(";")[0] for c in cookies)
            login_ok = resp.status == 200
    except urllib.error.HTTPError as e:
        login_ok = False
        lines.append(f"admin login: FAIL {e.code}")
    else:
        lines.append(f"admin login: {'OK' if login_ok else 'FAIL'}")

    if cookie_header:
        st_sec, sec = req("GET", "/api/secrets", headers={"Cookie": cookie_header})
        items = sec if isinstance(sec, list) else sec.get("items") or sec.get("secrets") or []
        qf = [x for x in items if isinstance(x, dict) and x.get("platform") == "qianfan"]
        lines.append(f"secrets list: {st_sec} qianfan_count={len(qf)}")
        for shop in SHOPS:
            hit = [x for x in qf if shop in str(x.get("shopName", ""))]
            preview = hit[0].get("valuePreview", "?")[:20] if hit else "MISSING"
            has_enc = "encryptedValue" in (hit[0] if hit else {})
            lines.append(f"  shop {shop}: {'found' if hit else 'MISSING'} preview={preview}... exposesEnc={has_enc}")

    # CORS bad origin
    bad_origin = urllib.request.Request(
        f"{BASE}/api/health",
        headers={"Origin": "http://evil.example.com"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(bad_origin, timeout=10) as resp:
            lines.append(f"CORS evil origin: unexpected {resp.status}")
    except urllib.error.HTTPError as e:
        lines.append(f"CORS evil origin: {e.code} ({'OK' if e.code == 403 else 'check'})")
    except urllib.error.URLError as e:
        lines.append(f"CORS evil origin blocked: OK ({type(e).__name__})")

    print("=== Online acceptance ===")
    for ln in lines:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        print(ln.encode(enc, errors="replace").decode(enc, errors="replace"))

    fails = [l for l in lines if "FAIL" in l or "STILL WORKS" in l or "MISSING" in l]
    if any("health" in f and "False" in f for f in lines):
        sys.exit(1)


if __name__ == "__main__":
    main()
