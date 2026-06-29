import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatOperation } from '../components/Layout';

export default function OperationsPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.operations().then(setLogs);
  }, []);

  return (
    <div>
      <h2>操作记录</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>说明</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.actor}</td>
                <td>{formatOperation(l)}</td>
                <td>{l.ip || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
