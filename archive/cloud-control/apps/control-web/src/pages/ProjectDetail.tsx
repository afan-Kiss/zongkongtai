import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/Layout';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    if (id) api.project(id).then(setProject);
  }, [id]);

  if (!project) return <div>加载中...</div>;

  return (
    <div>
      <p>
        <Link to="/projects">← 返回项目列表</Link>
      </p>
      <h2>{project.name}</h2>
      <div className="card">
        <p>
          <strong>编码：</strong>
          {project.code}
        </p>
        <p>
          <strong>分类：</strong>
          {project.category || '-'}
        </p>
        <p>
          <strong>位置：</strong>
          {project.locationType}
        </p>
        <p>
          <strong>本地路径：</strong>
          {project.localPath || '-'}
        </p>
        <p>
          <strong>服务器路径：</strong>
          {project.serverPath || '-'}
        </p>
        <p>
          <strong>状态：</strong>
          <StatusBadge status={project.status} />
        </p>
        <p>
          <strong>PM2：</strong>
          {project.pm2Name || '-'}
        </p>
        <p>
          <strong>健康地址：</strong>
          {project.healthUrl || '-'}
        </p>
        <p>
          <strong>备注：</strong>
          {project.notes || '-'}
        </p>
      </div>
      <div className="card">
        <h3>端口</h3>
        <table>
          <thead>
            <tr>
              <th>端口</th>
              <th>协议</th>
              <th>来源</th>
              <th>冲突</th>
            </tr>
          </thead>
          <tbody>
            {(project.ports || []).map((p: any) => (
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
                <td>{p.port}</td>
                <td>{p.protocol}</td>
                <td className="mono">
                  {p.sourceFile}:{p.sourceLine}
                </td>
                <td>
                  <StatusBadge status={p.conflictLevel} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>启动命令</h3>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>命令</th>
              <th>目录</th>
            </tr>
          </thead>
          <tbody>
            {(project.commands || []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.type}</td>
                <td className="mono">{c.command}</td>
                <td className="mono">{c.cwd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
