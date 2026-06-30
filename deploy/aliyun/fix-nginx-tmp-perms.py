#!/usr/bin/env python3
"""fix：修复 nginx 临时目录权限（仅目录权限，不重启 nginx）。"""
from ops_config import NGINX_TMP_DIR
from ops_lib import parse_fix_args, run_fix_cmds, run_ssh, ssh_session

TMP = f"{NGINX_TMP_DIR}/tmp"


def main() -> None:
    execute = parse_fix_args("修复 nginx 临时目录权限（chown/chmod，不重启 nginx）")
    inspect_cmds = [
        f"ls -la {NGINX_TMP_DIR}/ {TMP}/ {TMP}/client_body/ 2>&1",
        f"stat -c '%a %U:%G %n' {TMP} {TMP}/client_body/ 2>/dev/null || ls -ld {TMP}",
    ]
    planned = [
        f"chown -R nginx:nginx {TMP}",
        f"chmod -R 770 {TMP}",
    ]
    print("\n=== 当前权限 ===")
    with ssh_session() as client:
        for cmd in inspect_cmds:
            run_ssh(client, cmd, timeout=20)
    print("\n=== 计划修复权限 ===")
    for cmd in planned:
        print(f"  {cmd}")
    print(f"\n是否执行：{'是（--execute）' if execute else '否（dry-run）'}")
    steps = [(f"执行 {c}", c) for c in planned]
    run_fix_cmds(steps, execute=execute, timeout=30)
    if execute:
        print("\n=== 修复后权限 ===")
        with ssh_session() as client:
            for cmd in inspect_cmds:
                run_ssh(client, cmd, timeout=20)


if __name__ == "__main__":
    main()
