/** Shared deploy zip filtering — excludes sensitive/build artifacts. */
from __future__ import annotations

from pathlib import Path

SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    ".vite",
    "coverage",
    "logs",
    "tmp",
    "cache",
    "dist-electron",
    "dist-desktop",
    "win-unpacked",
}

SKIP_PARTS = {
    ".env",
    "dev.db",
    "dev.db-journal",
    "__pycache__",
    "prod.db",
    "prod.db-journal",
}

SENSITIVE_EXACT = {
    "deploy-output-credentials.txt",
    "deploy-output.txt",
    ".env",
    ".env.local",
    ".env.production",
}

SENSITIVE_SUFFIX = {".db", ".db-journal", ".log", ".zip"}

SENSITIVE_PARTS = {
    "deploy-output-credentials.txt",
    "deploy-output.txt",
    "qianfan-cookie-audit.json",
    "prod.db",
    "dev.db",
}


def _rel(path: Path, root: Path) -> str:
    return str(path.relative_to(root)).replace("\\", "/")


def is_sensitive(rel: str) -> bool:
    rel_l = rel.replace("\\", "/").lower()
    base = rel_l.split("/")[-1]
    if base in SENSITIVE_EXACT:
        return True
    if base.endswith(".env") and base != ".env.example":
        return True
    if any(base.endswith(s) for s in SENSITIVE_SUFFIX):
        return True
    if "scripts/" in rel_l and "report" in base and base.endswith(".json"):
        return True
    if base == "qianfan-cookie-audit.json":
        return True
    for part in SENSITIVE_PARTS:
        if part.lower() in rel_l:
            return True
    if "/native-helper/" in rel_l and any(x in rel_l for x in ("/bin/", "/obj/", "/publish/")):
        return True
    if "/dist-desktop/" in rel_l or rel_l.startswith("dist-desktop/"):
        return True
    if "/dist-electron/" in rel_l:
        return True
    return False


def should_skip(rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in SKIP_DIRS:
        return True
    for p in parts:
        if p in SKIP_DIRS:
            return True
    rel_l = rel.replace("\\", "/").lower()
    if any(x in rel_l for x in SKIP_PARTS):
        return True
    if is_sensitive(rel):
        return True
    if rel_l.endswith(".exe") and "native-helper" not in rel_l:
        return True
    return False


def scan_tree(root: Path) -> tuple[list[Path], int, list[str]]:
    include: list[Path] = []
    excluded = 0
    sensitive_hits: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = _rel(path, root)
        if should_skip(rel):
            excluded += 1
            if is_sensitive(rel):
                sensitive_hits.append(rel)
            continue
        include.append(path)
    return include, excluded, sensitive_hits
