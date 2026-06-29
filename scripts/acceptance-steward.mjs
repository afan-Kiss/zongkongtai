#!/usr/bin/env node
/** 项目管家一期验收 — 检查共享模块与 Git 安全过滤 */
import { filterGitPaths, normalizeRiskLevel, DEFAULT_RISK_BY_CODE } from '../packages/control-shared/dist/index.js';

const blocked = filterGitPaths(['.env', 'src/index.ts', 'node_modules/x/a.js']);
if (blocked.blocked.length !== 2) {
  console.error('FAIL: git filter expected 2 blocked, got', blocked.blocked.length);
  process.exit(1);
}
if (blocked.safe.length !== 1 || blocked.safe[0] !== 'src/index.ts') {
  console.error('FAIL: git filter safe paths', blocked.safe);
  process.exit(1);
}

const risk = normalizeRiskLevel(DEFAULT_RISK_BY_CODE['zhubo-control']);
if (risk !== 'protected') {
  console.error('FAIL: zhubo-control risk should be protected');
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, gitFilter: blocked, riskSample: risk }, null, 2));
