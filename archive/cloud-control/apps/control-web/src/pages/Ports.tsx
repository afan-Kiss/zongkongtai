import { useEffect, useState } from 'react';
import { api } from '../api';
import { StatusBadge, RoleBadge } from '../components/Layout';

export default function PortsPage() {
  const [ports, setPorts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'conflict' | 'warning'>('all');
  const [msg, setMsg] = useState('');

  async function load() {
    setPorts(await api.ports());
  }

  useEffect(() => {
    load();
  }, []);

  async function rescan() {
    try {
      const r: any = await api.rescanPorts();
      setMsg(r.message || '已触发扫描，稍等几秒后点刷新');
      setTimeout(load, 8000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '扫描失败');
    }
  }

  const filtered = ports
    .filter((p) => {
      if (filter === 'conflict') return p.conflictLevel === 'conflict';
      if (filter === 'warning') return p.conflictLevel === 'warning';
      return true;
    })
    .filter(
      (p) =>
        !search ||
        String(p.port).includes(search) ||
        p.project?.name?.includes(search) ||
        p.conflictReason?.includes(search),
    )
    .sort(
      (a, b) => a.port - b.port || (a.project?.name || '').localeCompare(b.project?.name || ''),
    );

  return (
    <div>
      <h2>端口管理</h2>
      <p>
        一眼看懂：红色是真冲突（两个项目都要监听同一端口），黄色是提醒（可能只是调用别人的服务）。
      </p>
      {msg && <div className="card">{msg}</div>}
      <div className="toolbar">
        <input
          placeholder="搜索端口、项目、原因"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">全部</option>
          <option value="conflict">只看冲突</option>
          <option value="warning">只看提醒</option>
        </select>
        <button className="btn btn-primary" onClick={rescan}>
          重新扫描
        </button>
        <button className="btn btn-secondary" onClick={load}>
          刷新
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>端口</th>
              <th>状态</th>
              <th>用途</th>
              <th>项目</th>
              <th>来源</th>
              <th>运行中</th>
              <th>进程</th>
              <th>PID</th>
              <th>原因说明</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className={
                  p.conflictLevel === 'conflict'
                    ? 'conflict'
                    : p.conflictLevel === 'warning'
                      ? 'warning'
                      : ''
                }
              >
                <td>
                  <strong>{p.port}</strong>
                </td>
                <td>
                  <StatusBadge status={p.conflictLevel} />
                </td>
                <td>
                  <RoleBadge role={p.role} />
                </td>
                <td>{p.project?.name || '未登记'}</td>
                <td className="mono">
                  {p.sourceFile
                    ? `${p.sourceFile.split('\\').pop()}:${p.sourceLine}`
                    : p.sourceType}
                </td>
                <td>{p.isRuntimeDetected ? '是' : '否'}</td>
                <td>{p.processName || '-'}</td>
                <td>{p.pid ?? '-'}</td>
                <td>{p.conflictReason || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
