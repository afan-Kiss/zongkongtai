#!/usr/bin/env node
/** 为 E:\我的软件源码 下各项目 manifest 补 riskLevel（仅写入缺失或需更新的字段） */
import fs from 'fs';
import path from 'path';

const ROOT = process.env.SCAN_ROOT || 'E:\\我的软件源码';

/** code → riskLevel，与项目管家规则一致 */
const RISK_BY_CODE = {
  'zhubo-control': 'protected',
  'zhubo-analysis': 'high',
  'qianfan-relay': 'high',
  'jade-scan': 'medium',
  'jade-accounting': 'medium',
  'xiangyu-system': 'medium',
  'churuku-helper': 'low',
  'doudian-cdp': 'medium',
  'doudian-bot': 'high',
  'doudian-chat-export': 'low',
  'doudian-gemini': 'medium',
};

const DIRS = [
  '总控台',
  '主播分析软件',
  '千帆中转机器人',
  '扫码枪登记出入库系统',
  '记账系统',
  '祥钰系统',
  '辅助出库软件',
  '抖店',
  '抖店gemini建议',
  '抖店机器人',
  '抖店聊天记录导出',
];

let updated = 0;
let skipped = 0;

for (const dir of DIRS) {
  const file = path.join(ROOT, dir, 'zhubo-control.manifest.json');
  if (!fs.existsSync(file)) {
    console.warn('SKIP missing', file);
    skipped += 1;
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  let m;
  try {
    m = JSON.parse(raw);
  } catch (e) {
    console.error('FAIL parse', file, e.message);
    process.exit(1);
  }
  const code = m.code;
  const target = RISK_BY_CODE[code];
  if (!target) {
    console.warn('SKIP unknown code', code, 'in', dir);
    skipped += 1;
    continue;
  }
  if (m.riskLevel === target) {
    console.log('OK already', dir, code, target);
    continue;
  }
  m.riskLevel = target;
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n', 'utf8');
  console.log('UPDATED', dir, code, '→', target);
  updated += 1;
}

console.log(JSON.stringify({ ok: true, updated, skipped }, null, 2));
