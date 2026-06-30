#!/usr/bin/env python3
import sys
import paramiko
from pathlib import Path

def sp(s):
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(s.encode(enc, errors="replace").decode(enc, errors="replace"))

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmd = """
find /www /root /tmp -name '*.db' -size +100k 2>/dev/null | while read f; do
  n=$(sqlite3 "$f" "select count(*) from SecretStore;" 2>/dev/null || echo -1)
  if [ "$n" != "-1" ] && [ "$n" -gt 0 ] 2>/dev/null; then
    echo "HIT $f secrets=$n"
  fi
done
"""
_, o, _ = c.exec_command(cmd, timeout=120)
sp(o.read().decode("utf-8", errors="replace").strip() or "NO_DB_WITH_SECRETS_FOUND")
c.close()
