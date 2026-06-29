import { useEffect, useState } from 'react';
import { api } from '../api';
import { StatusBadge } from '../components/Layout';

export default function HealthPage() {
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => { api.healthResults().then(setResults); }, []);

  return (
    <div>
      <h2>健康检查</h2>
      <div className="card">
        <table>
          <thead><tr><th>项目</th><th>地址</th><th>状态码</th><th>结果</th><th>延迟</th><th>检查时间</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.project?.name}</td>
                <td className="mono">{r.url}</td>
                <td>{r.statusCode ?? '-'}</td>
                <td><StatusBadge status={r.ok ? 'running' : 'error'} /></td>
                <td>{r.latencyMs != null ? `${r.latencyMs}ms` : '-'}</td>
                <td>{new Date(r.checkedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!results.length && <p>暂无健康检查记录，可在项目管理页点击「检查」。</p>}
      </div>
    </div>
  );
}
