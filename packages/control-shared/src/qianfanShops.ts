/** 千帆 Cookie 正式四店 canonical 名称（上传侧与 EXE 展示侧统一） */
export const QIANFAN_CANONICAL_SHOPS = [
  '拾玉居和田玉',
  '和田雅玉',
  '祥钰珠宝',
  'XY祥钰珠宝',
] as const;

export type QianfanCanonicalShop = (typeof QIANFAN_CANONICAL_SHOPS)[number];

/** 明确视为测试/联调数据的店铺名 */
export const QIANFAN_TEST_SHOP_EXACT = new Set([
  '店铺A',
  '店铺B',
  '店铺C',
  '店铺D',
  '测试店铺',
  '未识别店铺',
  '默认店铺',
]);

/** 标题/页面名 → canonical 的 alias 规则（按优先级） */
export const QIANFAN_SHOP_ALIAS_RULES: Array<{
  canonical: QianfanCanonicalShop;
  patterns: RegExp[];
}> = [
  { canonical: 'XY祥钰珠宝', patterns: [/XY\s*祥钰/i, /XY祥钰珠宝/i] },
  { canonical: '拾玉居和田玉', patterns: [/拾玉居/i] },
  { canonical: '和田雅玉', patterns: [/和田雅玉/i] },
  { canonical: '祥钰珠宝', patterns: [/祥钰珠宝/i, /(?<!XY)祥钰(?!珠宝)/i] },
];

export function normalizeShopLabel(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[-–—|｜·].*$/, '')
    .trim();
}

export function isQianfanTestShopName(raw: string): boolean {
  const n = normalizeShopLabel(raw);
  if (!n) return true;
  if (QIANFAN_TEST_SHOP_EXACT.has(n)) return true;
  if (/^店铺[A-Da-d]$/.test(n)) return true;
  if (/测试/.test(n)) return true;
  if (/^test/i.test(n)) return true;
  return false;
}

export function resolveCanonicalQianfanShopName(raw: string): QianfanCanonicalShop | null {
  const n = normalizeShopLabel(raw);
  if (!n) return null;

  for (const canonical of QIANFAN_CANONICAL_SHOPS) {
    if (n === canonical) return canonical;
  }

  for (const canonical of QIANFAN_CANONICAL_SHOPS) {
    if (n.includes(canonical) || canonical.includes(n)) return canonical;
  }

  for (const { canonical, patterns } of QIANFAN_SHOP_ALIAS_RULES) {
    if (patterns.some((p) => p.test(raw) || p.test(n))) return canonical;
  }

  return null;
}

export function resolveQianfanShopIdentity(raw: string): {
  rawShopName: string;
  canonicalShopName: QianfanCanonicalShop | null;
  isTest: boolean;
} {
  const rawShopName = String(raw || '').trim();
  const canonicalShopName = resolveCanonicalQianfanShopName(rawShopName);
  const isTest = isQianfanTestShopName(rawShopName) && !canonicalShopName;
  return { rawShopName, canonicalShopName, isTest };
}

export type QianfanCookieFreshness = 'missing' | 'normal' | 'expiring' | 'stale' | 'cloud_required';

const TWO_HOURS_MS = 2 * 3600000;
const SIX_HOURS_MS = 6 * 3600000;

export function qianfanCookieFreshness(
  updatedAt?: string | null,
  found = true,
  cloudConnected = true,
): QianfanCookieFreshness {
  if (!cloudConnected) return 'cloud_required';
  if (!found || !updatedAt) return 'missing';
  const ageMs = Date.now() - Date.parse(String(updatedAt));
  if (ageMs <= TWO_HOURS_MS) return 'normal';
  if (ageMs <= SIX_HOURS_MS) return 'expiring';
  return 'stale';
}

export function qianfanCookieStatusLabel(freshness: QianfanCookieFreshness): string {
  switch (freshness) {
    case 'normal':
      return '正常';
    case 'expiring':
      return '即将过期';
    case 'stale':
      return '超时';
    case 'missing':
      return '未收到';
    case 'cloud_required':
      return '需连接云端';
    default:
      return '未知';
  }
}

export interface QianfanShopCard {
  shopName: QianfanCanonicalShop;
  found: boolean;
  rawShopName?: string | null;
  canonicalShopName: QianfanCanonicalShop;
  status?: string;
  freshness?: QianfanCookieFreshness;
  updatedAt?: string | null;
  stale: boolean;
  source: string;
  cookieHash?: string | null;
  cookieLength?: number | null;
  id?: string | null;
  shopId?: string | null;
  accountName?: string | null;
  collectorMachine?: string | null;
  archived?: boolean;
}

export function buildQianfanShopCards(secrets: Array<Record<string, unknown>>): QianfanShopCard[] {
  const qianfan = secrets.filter(
    (s) => s.platform === 'qianfan' && s.keyName === 'cookie' && s.archived !== true,
  );

  return QIANFAN_CANONICAL_SHOPS.map((shopName) => {
    const row =
      qianfan.find((s) => s.shopName === shopName) ||
      qianfan.find((s) => s.canonicalShopName === shopName) ||
      qianfan.find(
        (s) =>
          resolveCanonicalQianfanShopName(String(s.rawShopName || s.shopName || '')) === shopName,
      );

    const updatedAt = (row?.updatedAt || row?.lastSeenAt) as string | null | undefined;
    const freshness = qianfanCookieFreshness(updatedAt, !!row);

    return {
      shopName,
      canonicalShopName: shopName,
      found: !!row,
      rawShopName:
        (row?.rawShopName as string) ||
        (row?.shopName !== shopName ? (row?.shopName as string) : null),
      status: (row?.status as string) || qianfanCookieStatusLabel(freshness),
      updatedAt: updatedAt ? String(updatedAt) : null,
      stale: freshness === 'stale' || freshness === 'expiring',
      freshness,
      source: String(row?.lastUploadedBy || row?.collectorSource || '千帆中转机器人'),
      cookieHash: (row?.cookieHash as string) || null,
      cookieLength: (row?.cookieLength as number) || null,
      id: (row?.id as string) || null,
      shopId: (row?.shopId as string) || null,
      accountName: (row?.accountName as string) || null,
      collectorMachine: (row?.collectorMachine as string) || null,
      archived: Boolean(row?.archived),
    };
  });
}

export function listArchivedOrTestSecrets(secrets: Array<Record<string, unknown>>) {
  return secrets.filter((s) => {
    if (s.platform !== 'qianfan' || s.keyName !== 'cookie') return false;
    if (s.archived === true) return true;
    const name = String(s.shopName || s.rawShopName || '');
    return isQianfanTestShopName(name) || !resolveCanonicalQianfanShopName(name);
  });
}
