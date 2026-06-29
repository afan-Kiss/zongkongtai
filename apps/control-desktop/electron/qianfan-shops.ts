export {
  QIANFAN_CANONICAL_SHOPS,
  buildQianfanShopCards,
  listArchivedOrTestSecrets,
  resolveCanonicalQianfanShopName,
  resolveQianfanShopIdentity,
} from '../../../packages/control-shared/src/qianfanShops';

export type { QianfanShopCard } from '../../../packages/control-shared/src/qianfanShops';

export function qianfanStaleMessage(updatedAt: string | null) {
  if (!updatedAt) return '总控台还没有该店铺的 Cookie 数据';
  const age = Date.now() - Date.parse(updatedAt);
  if (age > 3 * 3600000) {
    return '千帆 Cookie 超过 3 小时没更新，请检查公司电脑千帆客服台是否在线。';
  }
  return 'Cookie 状态正常';
}

/** @deprecated use buildQianfanShopCards */
export function buildQianfanShopStatus(secrets: any[]) {
  return buildQianfanShopCards(secrets);
}
