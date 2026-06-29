import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

let sqliteReady: Promise<void> | null = null;

export function ensureSqlitePragmas(): Promise<void> {
  if (!sqliteReady) {
    sqliteReady = (async () => {
      try {
        await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
      } catch (e) {
        console.warn('SQLite PRAGMA setup skipped:', e);
      }
    })();
  }
  return sqliteReady;
}

/** 带退避重试，缓解 SQLite 锁冲突 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await ensureSqlitePragmas();
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/SQLITE_BUSY|database is locked/i.test(msg) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 50 * (i + 1) ** 2));
    }
  }
  throw last;
}
