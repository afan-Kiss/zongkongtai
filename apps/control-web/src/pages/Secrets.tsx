import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { StatusBadge } from '../components/Layout';
import { QIANFAN_CANONICAL_SHOPS, buildQianfanShopCards, listArchivedOrTestSecrets } from '@zhubo/control-shared';

function hashPrefix(hash?: string | null) {
  return hash ? String(hash).slice(0, 8) : '-';
}

function formatStatusText(secret: any) {
  const updatedAt = secret.updatedAt ? new Date(secret.updatedAt).getTime() : 0;
  const ageMs = updatedAt ? Date.now() - updatedAt : Number.MAX_SAFE_INTEGER;
  const tenMin = 10 * 60 * 1000;
  const threeHours = 3 * 60 * 60 * 1000;

  if (secret.autoUpdated && ageMs <= tenMin) {
    return '刚刚由千帆中转机器人自动更新';
  }
  if (ageMs <= tenMin) return '10 分钟内更新过，状态正常';
  if (ageMs > threeHours) return '超过 3 小时没更新，注意检查千帆客服台是否还在线';
  if (secret.autoUpdated) return 'Cookie 已变化，已自动保存';
  return '手动维护';
}

export default function SecretsPage() {
  const [secrets, setSecrets] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [platformFilter, setPlatformFilter] = useState('qianfan');
  const [shopFilter, setShopFilter] = useState('');
  const [showTest, setShowTest] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const all = await api.secrets({ includeArchived: showTest, platform: platformFilter || undefined });
    setSecrets(all);
    setAudit(await api.secretAudit());
  }

  useEffect(() => {
    load().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [showTest, platformFilter]);

  const qianfanCards = useMemo(() => {
    if (platformFilter !== 'qianfan') return [];
    return buildQianfanShopCards(secrets);
  }, [secrets, platformFilter]);

  const archivedRows = useMemo(() => {
    if (!showTest) return [];
    return listArchivedOrTestSecrets(secrets);
  }, [secrets, showTest]);

  const tableRows = useMemo(() => {
    let rows = secrets;
    if (platformFilter) rows = rows.filter((s) => s.platform === platformFilter);
    if (shopFilter) rows = rows.filter((s) => String(s.shopName || '').includes(shopFilter));
    if (!showTest && platformFilter === 'qianfan') {
      rows = rows.filter((s) => !s.archived && QIANFAN_CANONICAL_SHOPS.includes(s.shopName));
    }
    return rows;
  }, [secrets, platformFilter, shopFilter, showTest]);

  async function alignQianfan() {
    try {
      const r = await api.alignQianfanSecrets();
      setMsg(`已对齐：归档 ${r.archived} 条，重命名 ${r.renamed} 条`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '对齐失败');
    }
  }

  return (
    <div>
      <h2>Cookie 管理</h2>
      <p>四个店铺的千帆 Cookie 统一存在这里。千帆中转机器人会自动上传；前端只显示脱敏内容，不返回完整 Cookie。</p>
      {msg && <div className="card">{msg}</div>}

      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          平台
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="qianfan">千帆</option>
            <option value="doudian">抖店</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label>
          店铺筛选
          <input value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} placeholder="店铺名包含…" />
        </label>
        <label>
          <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> 显示测试/历史 Cookie
        </label>
        <button className="btn btn-secondary" type="button" onClick={alignQianfan}>对齐千帆四店名称</button>
        <button className="btn btn-secondary" type="button" onClick={load}>刷新</button>
      </div>

      {platformFilter === 'qianfan' && (
        <div className="card">
          <h3>正式四店（canonical）</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {qianfanCards.map((s) => (
              <div key={s.shopName} style={{ border: '1px solid #333', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600 }}>{s.shopName}</div>
                <div className="muted">{s.found ? formatStatusText(s) : '暂无数据'}</div>
                {s.rawShopName && s.rawShopName !== s.shopName && (
                  <div className="muted">原始名：{s.rawShopName}</div>
                )}
                <div className="mono">hash {hashPrefix(s.cookieHash)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>已保存 Cookie</h3>
        <table>
          <thead>
            <tr>
              <th>平台</th>
              <th>canonical</th>
              <th>rawShopName</th>
              <th>Cookie 状态</th>
              <th>最后更新</th>
              <th>来源</th>
              <th>机器</th>
              <th>Hash</th>
              <th>脱敏预览</th>
              <th>归档</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((s) => (
              <tr key={s.id}>
                <td>{s.platform}</td>
                <td>{s.canonicalShopName || s.shopName || '-'}</td>
                <td>{s.rawShopName || '-'}</td>
                <td>
                  <div>{formatStatusText(s)}</div>
                  <StatusBadge status={s.status} />
                </td>
                <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-'}</td>
                <td>{s.collectorSource || s.lastUploadedBy || '-'}</td>
                <td>{s.collectorMachine || '-'}</td>
                <td className="mono">{hashPrefix(s.cookieHash)}</td>
                <td className="mono">{s.valuePreview}</td>
                <td>{s.archived ? '是' : '否'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showTest && archivedRows.length > 0 && (
        <div className="card">
          <h3>测试 / 历史 Cookie（已折叠）</h3>
          <table>
            <thead>
              <tr><th>店铺</th><th>raw</th><th>Hash</th><th>更新</th><th>来源</th></tr>
            </thead>
            <tbody>
              {archivedRows.map((s) => (
                <tr key={s.id as string}>
                  <td>{String(s.shopName || '-')}</td>
                  <td>{String(s.rawShopName || '-')}</td>
                  <td className="mono">{hashPrefix(s.cookieHash as string)}</td>
                  <td>{s.updatedAt ? new Date(String(s.updatedAt)).toLocaleString() : '-'}</td>
                  <td>{String(s.lastUploadedBy || s.collectorSource || '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>读取审计日志</h3>
        <table>
          <thead><tr><th>时间</th><th>调用方</th><th>平台</th><th>店铺</th><th>密钥</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.actor}</td>
                <td>{a.platform}</td>
                <td>{a.shopName || '-'}</td>
                <td>{a.keyName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
