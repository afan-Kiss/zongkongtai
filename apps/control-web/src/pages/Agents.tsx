import { useEffect, useState } from 'react';
import { api } from '../api';
import { StatusBadge } from '../components/Layout';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    api.agents().then(setAgents);
    const t = setInterval(() => api.agents().then(setAgents), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <h2>Agent 状态</h2>
      <p>本地 Windows Agent 主动连接云端 WebSocket，不对外暴露端口。</p>
      <div className="card">
        <table>
          <thead><tr><th>名称</th><th>机器名</th><th>系统</th><th>扫描根目录</th><th>状态</th><th>最后在线</th><th>版本</th></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.machineName || '-'}</td>
                <td>{a.os || '-'}</td>
                <td className="mono">{a.basePath || '-'}</td>
                <td><StatusBadge status={a.online ? 'online' : 'offline'} /></td>
                <td>{a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString() : '-'}</td>
                <td>{a.version || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!agents.length && <p>暂无 Agent，请在 Windows 电脑启动 control-agent。</p>}
      </div>
    </div>
  );
}
