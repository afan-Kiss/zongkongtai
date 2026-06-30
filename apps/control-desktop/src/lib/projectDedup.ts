import type { Project } from '@/types/desktop';

/** 总览日常常用项目（按名称包含匹配，各取一条） */
export const DAILY_PROJECT_KEYWORDS = [
  '扫码枪登记出入库',
  '记账系统',
  '祥钰系统',
  '辅助出库软件',
  '主播分析',
  '千帆中转',
];

function dedupKey(p: Project): string {
  const code = (p.code || '').trim().toLowerCase();
  if (code && !code.includes('probe')) return `code:${code}`;
  const path = (p.localPath || '').trim().toLowerCase();
  if (path) return `path:${path}`;
  return `name:${p.name.trim().toLowerCase()}`;
}

function scoreProject(p: Project): number {
  let s = 0;
  if (p.localPath) s += 20;
  if ((p as Project & { riskLevel?: string }).riskLevel) s += 8;
  if (p.code && !p.code.includes('probe')) s += 6;
  if (p.desktopStartCommand || p.startCommand || p.devCommand) s += 4;
  if ((p as Project & { manifestGroup?: string }).manifestGroup) s += 3;
  if (p.ports?.length) s += 2;
  return s;
}

function isProbeOrStale(p: Project): boolean {
  const code = (p.code || '').toLowerCase();
  const name = p.name.toLowerCase();
  return (
    code.includes('probe') ||
    name.includes('probe') ||
    name.includes('(旧)') ||
    name.includes('历史') ||
    code.endsWith('-old')
  );
}

/** 按 code → localPath → name 去重，保留信息更完整的一条 */
export function deduplicateProjects(projects: Project[]): Project[] {
  const best = new Map<string, Project>();
  for (const p of projects) {
    const key = dedupKey(p);
    const prev = best.get(key);
    if (!prev || scoreProject(p) > scoreProject(prev)) best.set(key, p);
  }
  return [...best.values()];
}

export function filterDisplayProjects(
  projects: Project[],
  opts: { showDuplicates?: boolean },
): Project[] {
  if (opts.showDuplicates) return projects;
  return deduplicateProjects(projects).filter((p) => !isProbeOrStale(p));
}

export function dailyFeaturedProjects(projects: Project[]): Project[] {
  const filtered = filterDisplayProjects(projects, { showDuplicates: false });
  const picked: Project[] = [];
  for (const kw of DAILY_PROJECT_KEYWORDS) {
    const match = filtered.find((p) => p.name.includes(kw));
    if (match && !picked.some((x) => x.id === match.id)) picked.push(match);
  }
  return picked.slice(0, 6);
}

export function formatPortList(ports: Project['ports'], max = 3): string {
  if (!ports?.length) return '—';
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const p of ports) {
    if (seen.has(p.port)) continue;
    seen.add(p.port);
    unique.push(p.port);
    if (unique.length >= max) break;
  }
  return unique.join(', ');
}

export function hasDuplicatePortRegistration(ports: Project['ports']): boolean {
  if (!ports?.length) return false;
  const seen = new Set<number>();
  for (const p of ports) {
    if (seen.has(p.port)) return true;
    seen.add(p.port);
  }
  return false;
}

export function findDuplicateGroups(projects: Project[]): string[] {
  const byName = new Map<string, number>();
  for (const p of projects) {
    const k = p.name.trim();
    if (!k) continue;
    byName.set(k, (byName.get(k) || 0) + 1);
  }
  return [...byName.entries()].filter(([, n]) => n > 1).map(([name, n]) => `${name}（${n} 条）`);
}

export const GIT_UNPUSHED_CACHE_KEY = 'zhubo:gitUnpushedCount';
