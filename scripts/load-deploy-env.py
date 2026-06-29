"""Load deploy credentials from gitignored local files into os.environ (no stdout secrets)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = [
    ROOT / ".env",
    ROOT / ".env.local",
    ROOT / "deploy" / ".env",
    ROOT / "deploy" / "aliyun" / ".env",
    ROOT / "deploy-output-credentials.txt",
    Path(r"E:\我的软件源码\记账系统\secrets\deploy.env"),
]


def parse_line(line: str) -> tuple[str, str] | None:
    s = line.strip()
    if not s or s.startswith("#"):
        return None
    if "=" not in s:
        return None
    k, v = s.split("=", 1)
    return k.strip(), v.strip().strip('"').strip("'")


def load_all() -> None:
    for path in CANDIDATES:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            parsed = parse_line(line)
            if not parsed:
                continue
            k, v = parsed
            if v and k not in os.environ:
                os.environ[k] = v


if __name__ == "__main__":
    load_all()
    print("SSH_PASS_set", bool(os.environ.get("SSH_PASS")))
    print("SERVICE_TOKEN_set", bool(os.environ.get("SERVICE_TOKEN")))
