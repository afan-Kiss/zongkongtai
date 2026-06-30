"""阿里云总控运维公共库 — SSH 连接、只读检查、fix 脚本 dry-run/execute。"""
from __future__ import annotations

import argparse
import socket
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import paramiko

from ops_config import SERVER_HOST

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_ssh_password() -> str:
    env_path = REPO_ROOT / ".env"
    if not env_path.is_file():
        print("缺少 SSH_PASS，无法连接服务器，请检查本地 .env", file=sys.stderr)
        sys.exit(1)
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("SSH_PASS="):
            continue
        val = line.split("=", 1)[1].strip().strip('"').strip("'")
        if val:
            return val
    print("缺少 SSH_PASS，无法连接服务器，请检查本地 .env", file=sys.stderr)
    sys.exit(1)


def open_ssh(timeout: int = 60) -> paramiko.SSHClient:
    pwd = load_ssh_password()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(SERVER_HOST, username="root", password=pwd, timeout=timeout)
    except socket.timeout:
        print(f"连接 {SERVER_HOST} 超时（{timeout}s），请检查网络或稍后重试。", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"连接 {SERVER_HOST} 失败：{exc}", file=sys.stderr)
        sys.exit(1)
    return client


@contextmanager
def ssh_session(timeout: int = 60) -> Iterator[paramiko.SSHClient]:
    client = open_ssh(timeout=timeout)
    try:
        yield client
    finally:
        client.close()


def run_ssh(
    client: paramiko.SSHClient,
    cmd: str,
    *,
    timeout: int = 30,
    label: str | None = None,
) -> tuple[str, str, int]:
    if label:
        print(f"\n>>> {label}")
    elif cmd:
        print(f"\n>>> {cmd[:160]}{'…' if len(cmd) > 160 else ''}")
    try:
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        status = stdout.channel.recv_exit_status()
    except socket.timeout:
        print(f"命令执行超时（{timeout}s）：{cmd[:120]}", file=sys.stderr)
        return "", f"timeout after {timeout}s", 124
    if out.rstrip():
        print(out.rstrip())
    if err.strip():
        print("ERR:", err.rstrip())
    return out, err, status


def run_check_cmds(cmds: list[str], *, timeout: int = 30) -> None:
    """check / diagnose 脚本：只读执行远程命令。"""
    with ssh_session() as client:
        for cmd in cmds:
            run_ssh(client, cmd, timeout=timeout)


def parse_fix_args(description: str) -> bool:
    """
    fix 脚本参数：默认 dry-run（只打印计划）。
    传 --execute 才真正修改服务器；--dry-run 可显式声明预览。
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="真正执行修复（默认只预览，不修改服务器）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印将执行的命令（默认行为）",
    )
    args = parser.parse_args()
    if args.execute and args.dry_run:
        print("不能同时传 --execute 和 --dry-run", file=sys.stderr)
        sys.exit(2)
    if args.execute:
        return True
    print("[dry-run] 未传 --execute，仅预览，不会修改服务器。")
    return False


def print_fix_plan(title: str, steps: list[str]) -> None:
    print(f"\n=== 计划：{title} ===")
    for i, step in enumerate(steps, 1):
        print(f"  {i}. {step}")


def run_fix_cmds(
    steps: list[tuple[str, str]],
    *,
    execute: bool,
    timeout: int = 60,
) -> None:
    """fix 脚本：dry-run 打印；execute 逐条执行并输出结果。"""
    titles = [t for t, _ in steps]
    print_fix_plan("修复步骤", titles)
    if not execute:
        return
    print("\n=== 开始执行 ===")
    with ssh_session(timeout=timeout) as client:
        for title, cmd in steps:
            print(f"\n--- {title} ---")
            run_ssh(client, cmd, timeout=timeout, label=cmd)
