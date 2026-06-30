#!/usr/bin/env python3
import base64
import hashlib
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, _ = c.exec_command("grep SECRET_ENCRYPTION_KEY /www/wwwroot/zhubo-control-center/.env | head -1")
raw = o.read().decode().strip()
val = raw.split("=", 1)[1].strip().strip('"').strip("'") if "=" in raw else ""
print("key_len_chars", len(val))
print("key_fp", hashlib.sha256(val.encode()).hexdigest()[:12])
for label, fn in [
    ("b64", lambda v: base64.b64decode(v)),
    ("b64_pad", lambda v: base64.b64decode(v + "=" * (-len(v) % 4))),
    ("urlsafe", lambda v: base64.urlsafe_b64decode(v + "=" * (-len(v) % 4))),
    ("hex", lambda v: bytes.fromhex(v)),
]:
    try:
        b = fn(val)
        print(label, "decoded_len", len(b))
    except Exception as e:
        print(label, "fail", type(e).__name__)
c.close()
