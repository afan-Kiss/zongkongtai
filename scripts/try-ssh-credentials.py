"""Try SSH to Aliyun using passwords from gitignored local files (no secret output)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def collect_candidates() -> dict[str, str]:
    candidates: dict[str, str] = {}
    files = [
        ROOT / ".env",
        ROOT / ".env.local",
        ROOT / "deploy" / ".env",
        ROOT / "deploy-output-credentials.txt",
        ROOT / "apps" / "control-server" / ".env",
        Path(r"E:\我的软件源码\记账系统\secrets\deploy.env"),
    ]
    for path in files:
        for k, v in parse_env_file(path).items():
            ku = k.upper()
            if v and any(x in ku for x in ("PASS", "SSH", "ROOT")):
                candidates[f"{path.name}:{k}"] = v
    if os.environ.get("SSH_PASS"):
        candidates["env:SSH_PASS"] = os.environ["SSH_PASS"]
    return candidates


def try_connect(password: str) -> bool:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            HOST,
            username="root",
            password=password,
            timeout=12,
            allow_agent=False,
            look_for_keys=False,
        )
        client.close()
        return True
    except Exception:
        return False


def main() -> int:
    candidates = collect_candidates()
    print(f"candidate_count={len(candidates)}")
    for label in candidates:
        ok = try_connect(candidates[label])
        print(f"{'OK' if ok else 'FAIL'} {label}")
        if ok:
            os.environ["SSH_PASS"] = candidates[label]
            # persist only SSH_PASS to gitignored .env if missing
            env_path = ROOT / ".env"
            text = env_path.read_text(encoding="utf-8", errors="ignore") if env_path.exists() else ""
            if "SSH_PASS=" not in text:
                with env_path.open("a", encoding="utf-8") as f:
                    if text and not text.endswith("\n"):
                        f.write("\n")
                    f.write(f"SSH_PASS={candidates[label]}\n")
                print("saved_SSH_PASS_to_local_env=yes")
            return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
