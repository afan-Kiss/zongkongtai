#!/usr/bin/env node
/**
 * 运维 Python 脚本验收：换行、语法、只读/dry-run 约束
 */
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CONTROL_DB = '/www/wwwroot/zhubo-control-center/apps/control-server/prod.db';

const LEGACY_PATH_ALLOW = new Set([
  'deploy/aliyun/ops_config.py',
  'deploy/aliyun/diagnose-db-path-conflict.py',
  'deploy/aliyun/incremental-deploy.py',
  'deploy/aliyun/check-nested-db.py',
  'deploy/aliyun/fix-db-path.py',
  'scripts/ssh-recover-db.py',
]);

/** check/diagnose 若含危险子串，须在此白名单（仅展示/远程诊断，不默认改服务器） */
const READONLY_DANGEROUS_ALLOW = new Set([
  // diagnose-upload-504 在远程 shell 里 curl，不含 chmod/sed/pm2
]);

const DANGEROUS_RE =
  /\b(chmod|chown)\b|sed -i|pm2 restart|pm2 delete|systemctl reload|systemctl restart/;

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function listPyFiles() {
  const out = [];
  for (const dir of ['deploy/aliyun', 'scripts']) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      if (name.endsWith('.py')) out.push(path.join(base, name));
    }
  }
  return out.sort();
}

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function checkNewlines(files, failures) {
  for (const file of files) {
    const r = rel(file);
    const raw = fs.readFileSync(file);
    const text = raw.toString('utf8');
    const lines = text.split(/\n/);
    const lineCount = lines.length;
    const newlineCount = (raw.toString('binary').match(/\n/g) || []).length;

    if (text.length > 200 && newlineCount < 3) {
      failures.push(`${r}: 疑似单行压缩（仅 ${newlineCount} 个换行）`);
    }

    if (lines[0]?.startsWith('#!') && lines[0].length > 40) {
      failures.push(`${r}: shebang 与代码挤在同一行`);
    }

    if (lines[0]?.startsWith('#!') && lineCount > 1 && lines[1]?.trim() && !lines[1].startsWith('"""') && !lines[1].startsWith('#')) {
      const second = lines[1].trim();
      if (second.startsWith('import ') || second.startsWith('from ')) {
        /* ok */
      }
    }

    if (text.includes('\r\n') || (text.includes('\r') && !text.includes('\r\n'))) {
      failures.push(`${r}: 含 CRLF/CR，应统一为 LF`);
    }

    if (!text.endsWith('\n')) {
      failures.push(`${r}: 文件末尾缺少换行符`);
    }
  }
}

function pyCompile(files, failures) {
  for (const file of files) {
    const r = rel(file);
    const res = spawnSync('python', ['-m', 'py_compile', file], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    if (res.status !== 0) {
      failures.push(`${r}: py_compile 失败 — ${(res.stderr || res.stdout || '').trim().slice(0, 200)}`);
    }
  }
}

function checkReadonlyScripts(files, failures) {
  for (const file of files) {
    const r = rel(file);
    const base = path.basename(file);
    if (!/^(check|diagnose)-/.test(base)) continue;
    if (READONLY_DANGEROUS_ALLOW.has(r)) continue;
    const text = readFile(file);
    if (DANGEROUS_RE.test(text)) {
      failures.push(`${r}: check/diagnose 脚本含危险命令模式（chmod/chown/sed/pm2/systemctl）`);
    }
  }
}

function checkFixScripts(files, failures) {
  for (const file of files) {
    const base = path.basename(file);
    if (!base.startsWith('fix-')) continue;
    const r = rel(file);
    const text = readFile(file);
    if (!text.includes('parse_fix_args')) {
      failures.push(`${r}: fix 脚本须引用 parse_fix_args`);
      continue;
    }
    if (!/parse_fix_args\s*\(/.test(text)) {
      failures.push(`${r}: fix 脚本须调用 parse_fix_args()`);
    }
    const opsLib = readFile(path.join(ROOT, 'deploy/aliyun/ops_lib.py'));
    if (!opsLib.includes('[dry-run] 未传 --execute')) {
      failures.push('deploy/aliyun/ops_lib.py: parse_fix_args 须默认 dry-run');
    }
  }
}

function checkOpsConfig(failures) {
  const cfgPath = path.join(ROOT, 'deploy/aliyun/ops_config.py');
  const text = readFile(cfgPath);
  if (!text.includes(`CONTROL_DB = "${CONTROL_DB}"`)) {
    failures.push(`ops_config.py: CONTROL_DB 须为 ${CONTROL_DB}`);
  }
}

function checkLegacyPaths(files, failures) {
  for (const file of files) {
    const r = rel(file);
    if (LEGACY_PATH_ALLOW.has(r)) continue;
    const text = readFile(file);
    if (/\bLEGACY_DB\b/.test(text)) {
      failures.push(`${r}: LEGACY_DB 仅允许出现在白名单诊断/迁移脚本`);
    }
    if (/apps\/control-server\/prisma\/prod\.db/.test(text)) {
      failures.push(`${r}: 旧路径 prisma/prod.db 仅允许出现在白名单脚本`);
    }
  }
}

function checkPrettierignore(failures) {
  const p = path.join(ROOT, '.prettierignore');
  const text = readFile(p);
  if (text.includes('\r')) {
    failures.push('.prettierignore: 含 CR 换行');
  }
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length < 10) {
    failures.push('.prettierignore: 规则过少，疑似被压成一行');
  }
  for (const line of lines) {
    if (line.includes(' ') && !line.startsWith('#')) {
      failures.push(`.prettierignore: 一行含多个规则 — ${line.slice(0, 60)}`);
    }
  }
}

const failures = [];
const pyFiles = listPyFiles();

checkNewlines(pyFiles, failures);
pyCompile(pyFiles, failures);
checkReadonlyScripts(pyFiles, failures);
checkFixScripts(pyFiles, failures);
checkOpsConfig(failures);
checkLegacyPaths(pyFiles, failures);
checkPrettierignore(failures);

if (failures.length) {
  console.error('FAIL ops scripts acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      pyFiles: pyFiles.length,
      checks: [
        'newlines',
        'py_compile',
        'readonly check/diagnose',
        'fix dry-run',
        'ops_config CONTROL_DB',
        'legacy path whitelist',
        'prettierignore',
      ],
    },
    null,
    2,
  ),
);
