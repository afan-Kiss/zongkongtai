#!/usr/bin/env python3
"""EXE 云端 Cookie 卡片数据验收（Bearer resolve，不打印完整 Cookie）."""
import json, urllib.parse, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
token = env.get("SERVICE_TOKEN", "")
BASE = "http://8.137.126.18/control"
SHOPS = ["拾玉居和田玉", "和田雅玉", "祥钰珠宝", "XY祥钰珠宝"]

def req(path, headers=None):
    r = urllib.request.Request(f"{BASE}{path}", headers=headers or {})
    with urllib.request.urlopen(r, timeout=20) as resp:
        return resp.status, json.loads(resp.read().decode())

st, h = req("/api/health")
print(f"health: {st} ok={h.get('ok')}")

# agents list needs admin; check via dashboard not available - use agent log note
cards = []
for shop in SHOPS:
    q = urllib.parse.quote(shop)
    r = urllib.request.Request(
        f"{BASE}/api/secrets/resolve?platform=qianfan&shopName={q}&keyName=cookie",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(r, timeout=20) as resp:
        data = json.loads(resp.read().decode())
    cards.append({
        "shopName": shop,
        "ok": data.get("ok") and bool(data.get("value")),
        "valueLen": len(data.get("value") or ""),
        "cookieHash8": str(data.get("cookieHash") or "")[:8],
        "updatedAt": data.get("updatedAt"),
    })

print("cloud cookie cards (resolve proxy for EXE 云端页):")
for c in cards:
    print(f"  {c['shopName']}: ok={c['ok']} hash8={c['cookieHash8']} updatedAt={c['updatedAt']} len={c['valueLen']}")
print(f"all4={all(x['ok'] for x in cards)}")
