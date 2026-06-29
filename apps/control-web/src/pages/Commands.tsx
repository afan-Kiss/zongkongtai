import { useEffect, useState } from 'react';
import { api } from '../api';

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({ projectId: '', name: 'dev', command: '', cwd: '', type: 'dev' });

  useEffect(() => {
    api.commands().then(setCommands);
    api.projects().then(setProjects);
  }, []);

  async function save() {
    if (!form.projectId || !form.command) return alert('请选择项目并填写命令');
    await api.createCommand(form);
    setCommands(await api.commands());
  }

  return (
    <div>
      <h2>启动命令管理</h2>
      <p>只允许执行这里登记过的白名单命令，网页不能直接跑任意 shell。</p>
      <div className="card">
        <h3>登记新命令</h3>
        <div className="form-row"><label>项目</label>
          <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">选择项目</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-row"><label>名称</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="form-row"><label>类型</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['dev', 'prod', 'build', 'deploy', 'test', 'worker', 'custom'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-row"><label>命令（白名单）</label><input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npm run dev" /></div>
        <div className="form-row"><label>工作目录</label><input value={form.cwd} onChange={(e) => setForm({ ...form, cwd: e.target.value })} placeholder="E:\我的软件源码\xxx" /></div>
        <button className="btn btn-primary" onClick={save}>保存命令</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>项目</th><th>名称</th><th>类型</th><th>命令</th><th>目录</th><th>启用</th></tr></thead>
          <tbody>
            {commands.map((c) => (
              <tr key={c.id}>
                <td>{c.project?.name}</td>
                <td>{c.name}</td>
                <td>{c.type}</td>
                <td className="mono">{c.command}</td>
                <td className="mono">{c.cwd}</td>
                <td>{c.enabled ? '是' : '否'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
