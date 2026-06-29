import { cloudClient } from './cloud-client';

import { arrangeQianfanWorkspace } from './native-helper-client';

import { isPortListening } from './port-manager';

import { buildQianfanShopCards } from './qianfan-shops';



export type WorkspaceStepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';



export interface WorkspaceStep {

  id: string;

  label: string;

  status: WorkspaceStepStatus;

  message?: string;

}



export interface WorkspaceDefinition {

  id: string;

  name: string;

  description: string;

  projectCodes: string[];

  steps: string[];

  /** 仅准备，不自动强启业务项目 */

  prepOnly?: boolean;

}



export const WORKSPACES: WorkspaceDefinition[] = [

  {

    id: 'qianfan',

    name: '千帆客服工作区',

    description: '查看四店 Cookie 状态 + 排列千帆客服台与总控窗口（不自动启动中转机器人）',

    projectCodes: ['千帆中转机器人', 'qianfan-bot'],

    steps: ['读取四店 Cookie', '检查更新时间', '排列窗口', '完成'],

    prepOnly: true,

  },

  {

    id: 'scanner',

    name: '扫码 / 记账工作区',

    description: '扫码枪系统 + 记账系统相关服务',

    projectCodes: ['扫码枪登记出入库系统', '记账系统', 'jade-accounting'],

    steps: ['检查端口', '检查路径', '启动后端', '启动前端', '打开页面', '完成'],

  },

  {

    id: 'ai',

    name: 'AI 客服工作区',

    description: 'Ollama + AI 客服助手 + 千帆中转',

    projectCodes: ['ai-customer-service', '千帆中转机器人', 'ollama'],

    steps: ['检查 Ollama', '检查端口', '启动服务', '打开页面', '完成'],

  },

  {

    id: 'zhubo',

    name: '主播分析工作区',

    description: '云端主播分析 + Cookie 状态',

    projectCodes: ['zhubo-analysis', '主播分析软件'],

    steps: ['检查云端', '检查 Cookie', '打开页面', '完成'],

  },

];



export async function runWorkspace(

  workspaceId: string,

  projects: any[],

  mainHwnd?: number,

  onStep?: (step: WorkspaceStep) => void,

): Promise<WorkspaceStep[]> {

  const ws = WORKSPACES.find((w) => w.id === workspaceId);

  if (!ws) throw new Error('未知工作区');



  const steps: WorkspaceStep[] = ws.steps.map((label, i) => ({

    id: `step-${i}`,

    label,

    status: 'pending' as WorkspaceStepStatus,

  }));



  const update = (idx: number, status: WorkspaceStepStatus, message?: string) => {

    steps[idx].status = status;

    steps[idx].message = message;

    onStep?.(steps[idx]);

  };



  const findProject = (codes: string[]) =>

    projects.find((p) => codes.some((c) => p.code === c || p.name?.includes(c)));



  try {

    if (workspaceId === 'qianfan') {

      update(0, 'running');

      await cloudClient.ensureLogin();

      const secrets = await cloudClient.secrets();

      const shops = buildQianfanShopCards(secrets);

      const found = shops.filter((s) => s.found).length;

      update(0, 'success', `已读取 ${found}/4 店 Cookie 状态`);



      update(1, 'running');

      const staleShops = shops.filter((s) => s.found && s.stale).map((s) => s.shopName);

      const missing = shops.filter((s) => !s.found).map((s) => s.shopName);

      if (missing.length) {

        update(1, 'error', `缺少：${missing.join('、')}`);

      } else if (staleShops.length) {

        update(1, 'error', `超过 3 小时未更新：${staleShops.join('、')}`);

      } else {

        update(1, 'success', '四店 Cookie 均在 3 小时内更新');

      }



      update(2, 'running');

      try {

        const res = await arrangeQianfanWorkspace(mainHwnd);

        update(2, res.qianfanFound ? 'success' : 'error', res.messages.join('；'));

      } catch (e) {

        update(2, 'error', e instanceof Error ? e.message : String(e));

      }



      update(3, 'success', '千帆工作区准备完成（未自动启动中转机器人）');

      return steps;

    }



    update(0, 'running');

    const ollama = isPortListening(11434);

    if (workspaceId === 'ai') {

      update(0, ollama ? 'success' : 'error', ollama ? 'Ollama 11434 正在运行' : 'Ollama 未检测到，请先启动 Ollama');

    } else {

      await cloudClient.ensureLogin();

      const dash = await cloudClient.dashboard();

      update(0, 'success', `云端冲突端口 ${dash.conflictCount || 0} 个，提醒 ${dash.warningCount || 0} 个`);

    }



    if (workspaceId === 'zhubo') {

      update(1, 'running');

      const health = await cloudClient.health();

      update(1, health.ok ? 'success' : 'error', health.ok ? '云端总控连接正常' : '云端连接失败');

      update(2, 'running');

      update(2, 'success', '请在 Web 页面打开云端主播分析');

      update(3, 'success', '工作区就绪');

      return steps;

    }



    update(1, 'running');

    const target = findProject(ws.projectCodes);

    if (!target?.localPath) {

      update(1, 'error', '找不到对应项目或本地路径');

      return steps;

    }

    update(1, 'success', `路径 OK：${target.localPath}`);



    if (workspaceId === 'scanner' || workspaceId === 'ai') {

      const { processManager } = await import('./process-manager');

      update(2, 'running');

      try {

        const check = await processManager.preflight(target);

        if (!check.ok) {

          update(2, 'error', check.message);

          return steps;

        }

        await processManager.start(target);

        update(2, 'success', `已启动 ${target.name}`);

      } catch (e) {

        update(2, 'error', e instanceof Error ? e.message : String(e));

        return steps;

      }



      update(3, 'running', '等待服务就绪…');

      await new Promise((r) => setTimeout(r, 3000));

      update(3, 'success', '服务启动中，请查看内嵌终端日志');

      update(4, 'success', '可在 Web 页面标签打开项目');

      update(5, 'success', '工作区启动完成');

    }

  } catch (e) {

    const pending = steps.find((s) => s.status === 'running' || s.status === 'pending');

    if (pending) {

      pending.status = 'error';

      pending.message = e instanceof Error ? e.message : String(e);

      onStep?.(pending);

    }

  }



  return steps;

}


