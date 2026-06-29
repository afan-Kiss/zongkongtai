const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ id: string; username: string }>('/api/auth/me'),
  dashboard: () => request<any>('/api/dashboard/stats'),
  projects: (includeArchived = false) =>
    request<any[]>(`/api/projects${includeArchived ? '?includeArchived=1' : ''}`),
  project: (id: string) => request<any>(`/api/projects/${id}`),
  createProject: (data: unknown) => request('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: unknown) =>
    request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  startProject: (id: string) => request(`/api/projects/${id}/start`, { method: 'POST' }),
  stopProject: (id: string) => request(`/api/projects/${id}/stop`, { method: 'POST' }),
  restartProject: (id: string) => request(`/api/projects/${id}/restart`, { method: 'POST' }),
  healthCheck: (id: string) => request(`/api/projects/${id}/health-check`, { method: 'POST' }),
  ports: () => request<any[]>('/api/ports'),
  portConflicts: () => request<any[]>('/api/ports/conflicts'),
  rescanPorts: () => request('/api/ports/rescan', { method: 'POST' }),
  secrets: (params?: { platform?: string; includeArchived?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.platform) q.set('platform', params.platform);
    if (params?.includeArchived) q.set('includeArchived', '1');
    const qs = q.toString();
    return request<any[]>(`/api/secrets${qs ? `?${qs}` : ''}`);
  },
  alignQianfanSecrets: () => request<{ ok: boolean; archived: number; renamed: number }>('/api/secrets/maintenance/align-qianfan', { method: 'POST' }),
  createSecret: (data: unknown) => request('/api/secrets', { method: 'POST', body: JSON.stringify(data) }),
  updateSecret: (id: string, data: unknown) =>
    request(`/api/secrets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  testSecret: (id: string) => request(`/api/secrets/${id}/test`, { method: 'POST' }),
  secretAudit: () => request<any[]>('/api/secrets/audit'),
  commands: () => request<any[]>('/api/commands'),
  createCommand: (data: unknown) => request('/api/commands', { method: 'POST', body: JSON.stringify(data) }),
  agents: () => request<any[]>('/api/agents'),
  healthResults: () => request<any[]>('/api/dashboard/health-results/list'),
  operations: () => request<any[]>('/api/dashboard/operations'),
};
