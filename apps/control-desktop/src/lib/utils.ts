import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso?: string | null) {
  if (!iso) return '未知';
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '未知';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function hashPrefix(hash?: string | null) {
  return hash ? hash.slice(0, 8) : '—';
}
