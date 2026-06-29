import type {
  AgentScanPayload,
  ScanCommandResult,
  ScanPortResult,
  ScanProjectResult,
} from './types';

/** 保证值为数组；null / undefined / 非数组时返回空数组 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/** 扫描项目：ports / commands 必须为数组 */
export function normalizeScanProject(p: ScanProjectResult): ScanProjectResult {
  return {
    ...p,
    ports: asArray<ScanPortResult>(p.ports),
    commands: asArray<ScanCommandResult>(p.commands),
  };
}

/** 扫描入库前统一规范化，避免 sp.commands / sp.ports 不可迭代 */
export function normalizeScanPayload(payload: AgentScanPayload): AgentScanPayload {
  return {
    ...payload,
    projects: asArray<ScanProjectResult>(payload.projects).map(normalizeScanProject),
    runtimePorts: asArray(payload.runtimePorts),
    unknownPorts: asArray(payload.unknownPorts),
  };
}

/** manifestToScanFields 返回值中的 ports / commands 兜底 */
export function normalizeScanFields<T extends { ports?: unknown; commands?: unknown }>(
  fields: T,
): T & { ports: ScanPortResult[]; commands: ScanCommandResult[] } {
  return {
    ...fields,
    ports: asArray<ScanPortResult>(fields.ports),
    commands: asArray<ScanCommandResult>(fields.commands),
  };
}
