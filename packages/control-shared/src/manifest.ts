export const MANIFEST_FILENAME = 'zhubo-control.manifest.json';

export type ManifestHealthType = 'http' | 'process' | 'missing';
export type ManifestCookieMode = 'none' | 'pending' | 'control';
export type ManifestLocationType = 'local' | 'cloud' | 'mixed';

export interface ManifestServiceEntry {
  name: string;
  command: string;
  port?: number;
  healthUrl?: string;
  webUrl?: string;
  type?: 'dev' | 'prod' | 'build' | 'worker' | 'custom';
}

export interface ManifestControlMeta {
  enabled?: boolean;
  showInDesktop?: boolean;
  autoStart?: boolean;
  cookieMode?: ManifestCookieMode;
  favorite?: boolean;
  group?: string;
  notes?: string;
}

export interface ZhuboControlManifest {
  manifestVersion?: number;
  name: string;
  code: string;
  category: string;
  locationType?: ManifestLocationType;
  gitRemote?: string;
  localPath?: string;
  desktopStartCommand?: string;
  desktopStopMode?: 'process-tree' | 'port' | 'manual';
  localWebUrl?: string;
  localHealthUrl?: string;
  publicUrl?: string;
  healthType?: ManifestHealthType;
  healthUrl?: string;
  startCommand?: string;
  devCommand?: string;
  buildCommand?: string;
  pm2Name?: string;
  ports?: number[];
  services?: ManifestServiceEntry[];
  control?: ManifestControlMeta;
}

/** EXE 左侧分组顺序 */
export const PROJECT_GROUP_ORDER = [
  '常用',
  '总控',
  '主播分析',
  '千帆',
  '扫码/出入库',
  '记账',
  '抖店',
  'AI 客服',
  '工具服务',
  '其他',
] as const;

export type ProjectGroup = (typeof PROJECT_GROUP_ORDER)[number];

export function categoryToGroup(category: string, favorite?: boolean): ProjectGroup {
  if (favorite) return '常用';
  const c = String(category || '').trim();
  if (/总控/.test(c)) return '总控';
  if (/主播/.test(c)) return '主播分析';
  if (/千帆/.test(c)) return '千帆';
  if (/扫码|出入库|库存/.test(c)) return '扫码/出入库';
  if (/记账|财务/.test(c)) return '记账';
  if (/抖店/.test(c)) return '抖店';
  if (/AI|客服|Gemini|gemini/.test(c)) return 'AI 客服';
  if (/工具|祥钰|Ollama|embedding/.test(c)) return '工具服务';
  return '其他';
}

export function readManifestJson(raw: unknown): ZhuboControlManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name || '').trim();
  const code = String(o.code || '').trim();
  const category = String(o.category || '').trim();
  if (!name || !code) return null;
  return {
    manifestVersion: Number(o.manifestVersion) || 1,
    name,
    code,
    category: category || '其他',
    locationType: (o.locationType as ManifestLocationType) || 'local',
    gitRemote: o.gitRemote ? String(o.gitRemote) : undefined,
    localPath: o.localPath ? String(o.localPath) : undefined,
    desktopStartCommand: o.desktopStartCommand ? String(o.desktopStartCommand) : undefined,
    desktopStopMode: o.desktopStopMode as ZhuboControlManifest['desktopStopMode'],
    localWebUrl: o.localWebUrl ? String(o.localWebUrl) : undefined,
    localHealthUrl: o.localHealthUrl ? String(o.localHealthUrl) : undefined,
    publicUrl: o.publicUrl ? String(o.publicUrl) : undefined,
    healthType: (o.healthType as ManifestHealthType) || 'http',
    healthUrl: o.healthUrl ? String(o.healthUrl) : undefined,
    startCommand: o.startCommand ? String(o.startCommand) : undefined,
    devCommand: o.devCommand ? String(o.devCommand) : undefined,
    buildCommand: o.buildCommand ? String(o.buildCommand) : undefined,
    pm2Name: o.pm2Name ? String(o.pm2Name) : undefined,
    ports: Array.isArray(o.ports) ? o.ports.map((p) => Number(p)).filter((p) => p > 0) : undefined,
    services: Array.isArray(o.services)
      ? (o.services as ManifestServiceEntry[]).filter((s) => s?.name && s?.command)
      : undefined,
    control: o.control && typeof o.control === 'object' ? (o.control as ManifestControlMeta) : undefined,
  };
}

export function manifestToScanFields(m: ZhuboControlManifest, projectDir: string) {
  const healthUrl =
    m.localHealthUrl ||
    m.healthUrl ||
    (m.healthType === 'http' && m.ports?.[0]
      ? `http://127.0.0.1:${m.ports[0]}/api/health`
      : undefined);

  return {
    name: m.name,
    code: m.code,
    localPath: m.localPath || projectDir,
    category: m.category,
    startCommand: m.startCommand,
    devCommand: m.devCommand || m.desktopStartCommand,
    buildCommand: m.buildCommand,
    pm2Name: m.pm2Name,
    healthUrl,
    gitRemote: m.gitRemote,
    localWebUrl: m.localWebUrl,
    localHealthUrl: m.localHealthUrl || healthUrl,
    publicUrl: m.publicUrl,
    desktopStartCommand: m.desktopStartCommand,
    locationType: m.locationType || 'local',
    notes: m.control?.notes,
    ports: (m.ports || []).map((port) => ({
      port,
      protocol: 'http',
      host: '127.0.0.1',
      sourceFile: MANIFEST_FILENAME,
      sourceLine: 0,
      sourceType: 'manifest',
      purpose: `[manifest] ${m.name} :${port}`,
    })),
    commands: (m.services || []).map((s) => ({
      name: s.name,
      command: s.command,
      cwd: m.localPath || projectDir,
      type: (s.type || 'custom') as import('./types').CommandType,
    })),
  };
}
