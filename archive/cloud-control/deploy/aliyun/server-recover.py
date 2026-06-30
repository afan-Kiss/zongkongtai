#!/usr/bin/env python3
"""fix：从备份恢复生产库（需 --execute）。"""
from ops_config import CONTROL_DB, CONTROL_ENTRY, CONTROL_PM2, CONTROL_ROOT
from ops_lib import parse_fix_args, run_fix_cmds, run_ssh, ssh_session

BAK = "/tmp/control-prod-db-backup-274158.db"
DB = CONTROL_DB
DEPLOY = CONTROL_ROOT


def main() -> None:
    execute = parse_fix_args("从备份恢复生产库并重启 control-center")
    with ssh_session() as client:
        for label, cmd in [
            ("bak_secrets", f'sqlite3 {BAK} "select count(*) from SecretStore;"'),
            ("cur_secrets", f'sqlite3 "{DB}" "select count(*) from SecretStore;"'),
        ]:
            _, o, _ = client.exec_command(cmd, timeout=20)
            print(f"{label}: {o.read().decode().strip()}")
        _, o, _ = client.exec_command(f'sqlite3 {BAK} "select count(*) from SecretStore;"', timeout=20)
        bak_count = int(o.read().decode().strip() or "0")
        _, o, _ = client.exec_command(f'sqlite3 "{DB}" "select count(*) from SecretStore;"', timeout=20)
        cur_count = int(o.read().decode().strip() or "0")
    if bak_count <= cur_count:
        print(f"无需恢复（备份={bak_count} 当前={cur_count}）")
        return
    restore_cmd = f"""
cp {BAK} {DB}
chmod 644 {DB}
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
cd {DEPLOY}
pm2 delete {CONTROL_PM2} 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 3
curl -sf http://127.0.0.1:4790/api/health
curl -sf {CONTROL_ENTRY}api/health
"""
    print(f"计划从备份恢复（bak={bak_count} > cur={cur_count}）")
    run_fix_cmds([("restore db", restore_cmd)], execute=execute, timeout=120)


if __name__ == "__main__":
    main()
