import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatOperation } from '../components/Layout';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
  }, []);

  if (!data) return <div>加载中...</div>;

  return (
    <div>
      <h2>首页仪表盘</h2>
      <div className="grid" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="label">真实项目数</div><div className="value">{data.projectCount}</div></div>
        <div className="stat"><div className="label">Agent 在线</div><div className="value">{data.agentsOnline}/{data.agentsTotal}</div></div>
        <div className="stat"><div className="label">端口冲突</div><div className="value">{data.conflictCount}</div></div>
        <div className="stat"><div className="label">端口提醒</div><div className="value">{data.warningCount ?? 0}</div></div>
        <div className="stat"><div className="label">未知占用</div><div className="value">{data.unknownPortCount ?? 0}</div></div>
        <div className="stat"><div className="label">最近扫描</div><div className="value" style={{ fontSize: 14 }}>{data.lastScanAt ? new Date(data.lastScanAt).toLocaleString() : '-'}</div></div>
      </div>
      <div className="card">
        <h3>最近操作</h3>
        <table>
          <thead><tr><th>时间</th><th>说明</th></tr></thead>
          <tbody>
            {(data.recentOps || []).map((op: any) => (
              <tr key={op.id}>
                <td>{new Date(op.createdAt).toLocaleString()}</td>
                <td>{formatOperation(op)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><Link to="/projects">进入项目管理 →</Link> · <Link to="/ports">端口管理 →</Link></p>
    </div>
  );
}
