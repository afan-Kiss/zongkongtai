import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, getActor, getClientIp } from '../middleware/auth';
import { writeOperationLog } from '../services/operationLog';
import { agentHub } from '../services/agentHub';
import { paramId } from '../lib/params';
import { parseProjectCreate, parseProjectUpdate, formatZodError } from '../lib/validateInput';
import { readManifestJson } from '@zhubo/control-shared';
import { importManifests } from '../services/manifestImport';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const projects = await prisma.project.findMany({
    where: includeArchived ? undefined : { archived: false },
    include: { ports: true, healthResults: { orderBy: { checkedAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
});

router.post('/', requireAuth, async (req, res) => {
  let data;
  try {
    data = parseProjectCreate(req.body);
  } catch (e) {
    return res.status(400).json({ error: formatZodError(e) });
  }
  const project = await prisma.project.create({ data });
  await writeOperationLog({
    actor: getActor(req),
    action: 'create_project',
    targetType: 'project',
    targetId: project.id,
    detail: { name: project.name },
    ip: getClientIp(req),
  });
  res.json(project);
});

router.post('/import-manifests', requireAuth, async (req, res) => {
  const raw = req.body?.manifests;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: 'manifests 必须是数组' });
  }
  const manifests = raw.map((item) => readManifestJson(item)).filter(Boolean) as NonNullable<
    ReturnType<typeof readManifestJson>
  >[];
  if (!manifests.length) {
    return res.status(400).json({ error: '没有有效的 manifest 条目' });
  }
  const result = await importManifests(manifests, getActor(req), getClientIp(req));
  res.json({ ok: true, ...result });
});

router.get('/:id', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: paramId(req) },
    include: {
      ports: true,
      commands: true,
      healthResults: { orderBy: { checkedAt: 'desc' }, take: 20 },
    },
  });
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json(project);
});

router.put('/:id', requireAuth, async (req, res) => {
  let data;
  try {
    data = parseProjectUpdate(req.body);
  } catch (e) {
    return res.status(400).json({ error: formatZodError(e) });
  }
  const project = await prisma.project.update({ where: { id: paramId(req) }, data });
  await writeOperationLog({
    actor: getActor(req),
    action: 'update_project',
    targetType: 'project',
    targetId: project.id,
    ip: getClientIp(req),
  });
  res.json(project);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const id = paramId(req);
  await prisma.project.delete({ where: { id } });
  await writeOperationLog({
    actor: getActor(req),
    action: 'delete_project',
    targetType: 'project',
    targetId: id,
    ip: getClientIp(req),
  });
  res.json({ ok: true });
});

async function runProjectAction(
  req: import('express').Request,
  action: 'start' | 'stop' | 'restart',
) {
  const projectId = paramId(req);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { commands: { where: { enabled: true } } },
  });
  if (!project) return { status: 404, body: { error: '项目不存在' } };

  const cmdType = action === 'start' ? 'dev' : action === 'stop' ? 'custom' : 'dev';
  const command = project.commands.find((c) => c.type === cmdType) || project.commands[0];
  if (!command) return { status: 400, body: { error: '未登记启动命令，请先在命令管理中添加' } };

  const agentId = command.agentId || agentHub.getFirstOnlineAgentId();
  if (!agentId) return { status: 503, body: { error: '没有在线的本地 Agent' } };

  try {
    const msgType = action === 'stop' ? 'stop_command' : 'run_command';
    await agentHub.sendCommand(agentId, {
      type: msgType,
      requestId: '',
      projectId: project.id,
      commandId: command.id,
      command: command.command,
      cwd: command.cwd || project.localPath || '',
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: action === 'stop' ? 'stopped' : 'running' },
    });
    await writeOperationLog({
      actor: getActor(req),
      action: `${action}_project`,
      targetType: 'project',
      targetId: project.id,
      detail: { command: command.name },
      ip: getClientIp(req),
    });
    return { status: 200, body: { ok: true, message: `${action} 指令已发送` } };
  } catch (e) {
    return { status: 500, body: { error: e instanceof Error ? e.message : '执行失败' } };
  }
}

router.post('/:id/start', requireAuth, async (req, res) => {
  const result = await runProjectAction(req, 'start');
  res.status(result.status).json(result.body);
});

router.post('/:id/stop', requireAuth, async (req, res) => {
  const result = await runProjectAction(req, 'stop');
  res.status(result.status).json(result.body);
});

router.post('/:id/restart', requireAuth, async (req, res) => {
  await runProjectAction(req, 'stop');
  const result = await runProjectAction(req, 'start');
  res.status(result.status).json(result.body);
});

router.get('/:id/logs', requireAuth, async (req, res) => {
  res.json({
    lines: ['日志功能 MVP：Agent 上报后将在此展示', `项目 ID: ${paramId(req)}`],
  });
});

router.post('/:id/health-check', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: paramId(req) } });
  if (!project?.healthUrl) return res.status(400).json({ error: '未配置健康检查地址' });

  const start = Date.now();
  try {
    const resp = await fetch(project.healthUrl, { signal: AbortSignal.timeout(10000) });
    const latencyMs = Date.now() - start;
    const ok = resp.ok;
    const result = await prisma.healthCheckResult.create({
      data: {
        projectId: project.id,
        url: project.healthUrl,
        statusCode: resp.status,
        ok,
        message: ok ? '正常' : `HTTP ${resp.status}`,
        latencyMs,
      },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: ok ? 'running' : 'error' },
    });
    res.json(result);
  } catch (e) {
    const result = await prisma.healthCheckResult.create({
      data: {
        projectId: project.id,
        url: project.healthUrl,
        ok: false,
        message: e instanceof Error ? e.message : '检查失败',
        latencyMs: Date.now() - start,
      },
    });
    await prisma.project.update({ where: { id: project.id }, data: { status: 'error' } });
    res.json(result);
  }
});

export default router;
