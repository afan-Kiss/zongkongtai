#!/usr/bin/env python3
"""千帆四店 Cookie 重传验收（不打印完整 Cookie / Token）."""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://8.137.126.18/control"
SHOPS = ["拾玉居和田玉", "和田雅玉", "祥钰珠宝", "XY祥钰珠宝"]
BOT_CONFIG = Path(r"e:\我的软件源码\千帆中转机器人\config.wxbot-new.json")
BOT_SHOPS = Path(r"e:\我的软件源码\千帆中转机器人\config\qianfan-shops.json")


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


def fp(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:12]


def req(method: str, path: str, headers: dict | None = None, body: dict | None = None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", **(headers or {})}
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:300]}


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

    # --- I. Bot config check ---
    bot_cfg = json.loads(BOT_CONFIG.read_text(encoding="utf-8"))
    cc = bot_cfg.get("controlCenter") or {}
    bot_token = str(cc.get("serviceToken") or "").strip()
    lines.append("=== 一、千帆中转机器人配置 ===")
    lines.append(f"controlCenter.enabled: {cc.get('enabled')}")
    lines.append(f"serverUrl: {cc.get('serverUrl')}")
    lines.append(f"collectorMachine: {cc.get('collectorMachine')}")
    lines.append(
        f"serviceToken 与线上匹配: {bool(token) and bot_token == token} "
        f"(fp local={fp(bot_token)} server={fp(token)})"
    )
    shops_cfg = json.loads(BOT_SHOPS.read_text(encoding="utf-8"))
    cfg_names = [str(x.get("shopName", "")).strip() for x in shops_cfg]
    for shop in SHOPS:
        lines.append(f"qianfan-shops.json 含 {shop}: {shop in cfg_names}")

    # --- health ---
    st, h = req("GET", "/api/health")
    lines.append(f"\nhealth: {st} ok={h.get('ok')}")

    # --- III. Secrets list (admin session) ---
    lines.append("\n=== 三、Secrets 页验收 ===")
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
    except urllib.error.HTTPError as e:
        lines.append(f"admin login FAIL: {e.code}")

    qf: list[dict] = []
    if cookie_header:
        st_sec, sec = req("GET", "/api/secrets", headers={"Cookie": cookie_header})
        items = sec if isinstance(sec, list) else sec.get("items") or sec.get("secrets") or []
        qf = [x for x in items if isinstance(x, dict) and x.get("platform") == "qianfan"]
        lines.append(f"secrets list HTTP {st_sec}, qianfan 记录数={len(qf)}")
        for shop in SHOPS:
            hit = [
                x
                for x in qf
                if x.get("shopName") == shop or x.get("canonicalShopName") == shop
            ]
            if not hit:
                lines.append(f"  {shop}: MISSING")
                continue
            row = hit[0]
            ch = str(row.get("cookieHash") or row.get("valueHash") or "")
            preview = str(row.get("valuePreview") or "")
            updated = row.get("updatedAt") or row.get("lastUpdatedAt") or "-"
            has_enc = "encryptedValue" in row
            lines.append(
                f"  {shop}: preview={'有' if preview else '无'} "
                f"updatedAt={updated} hash8={ch[:8] if ch else '-'} "
                f"encryptedValue暴露={has_enc}"
            )

    # --- IV. resolve 四店 ---
    lines.append("\n=== 四、resolve 验收 ===")
    resolve_ok = 0
    for shop in SHOPS:
        q = urllib.parse.quote(shop)
        st_b, rb = req(
            "GET",
            f"/api/secrets/resolve?platform=qianfan&shopName={q}&keyName=cookie",
            headers={"Authorization": f"Bearer {token}"},
        )
        has_val = bool(rb.get("value")) and st_b == 200
        if has_val:
            resolve_ok += 1
        val_len = len(str(rb.get("value") or ""))
        lines.append(
            f"  Bearer {shop}: HTTP {st_b} ok={rb.get('ok')} valueLen={val_len if has_val else 0}"
        )
        st_no, _ = req(
            "GET",
            f"/api/secrets/resolve?platform=qianfan&shopName={q}&keyName=cookie",
        )
        lines.append(f"  no-token {shop}: HTTP {st_no} ({'OK' if st_no == 403 else 'FAIL'})")

    # query token must fail
    st_q, _ = req(
        "GET",
        f"/api/secrets/resolve?platform=qianfan&shopName={urllib.parse.quote(SHOPS[0])}&keyName=cookie&serviceToken={urllib.parse.quote(token)}",
    )
    lines.append(f"query serviceToken: HTTP {st_q} ({'disabled OK' if st_q != 200 else 'FAIL'})")

    # --- OperationLog ---
    lines.append("\n=== OperationLog ===")
    if cookie_header:
        for action in ["qianfan_cookie_upload", "secret_resolve"]:
            st_log, log = req(
                "GET",
                f"/api/operation-logs?action={urllib.parse.quote(action)}&limit=5",
                headers={"Cookie": cookie_header},
            )
            entries = log if isinstance(log, list) else log.get("items") or log.get("logs") or []
            lines.append(f"  {action}: HTTP {st_log} recent={len(entries)}")

    lines.append(f"\nresolve 四店可读: {resolve_ok}/4")
    print("\n".join(lines))

    missing = [s for s in SHOPS if not any(x.get("shopName") == s or x.get("canonicalShopName") == s for x in qf)]
    if missing or resolve_ok < 4:
        sys.exit(1)


if __name__ == "__main__":
    main()
