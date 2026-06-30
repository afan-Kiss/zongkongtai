import { useEffect, useState } from 'react';
import { api } from '../api';

export default function GitStatusPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    api.stewardGitStatus().then(setRows).catch(console.error);
  }, []);

  return (
    <div>
      <h2>Git 状态</h2>
      <p style={{ color: '#888', marginBottom: 16 }}>
        云端展示项目 gitRemote / 分支；完整 status / commit / push 请用本地 EXE「Git 上传」。
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>项目</th>
            <th>分支</th>
            <th>gitRemote</th>
            <th>本地路径</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.projectCode}>
              <td>{r.projectName}</td>
              <td>{r.branch || '—'}</td>
              <td style={{ fontSize: 12 }}>{r.gitRemote || '—'}</td>
              <td style={{ fontSize: 12 }}>{r.localPath || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
