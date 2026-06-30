import { prisma } from '../lib/prisma';

const SEED_CODES = new Set([
  'qianfan-bot',
  'jade-accounting',
  'scanner-system',
  'ai-customer-service',
]);

export async function archiveStaleProjects(scannedCodes: Set<string>, scannedNames: Set<string>) {
  const all = await prisma.project.findMany({
    where: { archived: false },
    include: { ports: { take: 1 }, commands: { take: 1 } },
  });

  const archived: string[] = [];

  for (const p of all) {
    if (p.locationType === 'cloud' && p.serverPath) continue;
    if (scannedCodes.has(p.code)) continue;

    const duplicateName = scannedNames.has(p.name);
    const isSeedCode = SEED_CODES.has(p.code);
    const noScan = !p.lastScannedAt;
    const noLocal = !p.localPath;
    const noPortsOrCmds = p.ports.length === 0 && p.commands.length === 0;
    const seedNotes = (p.notes || '').includes('种子') || (p.notes || '').includes('待 Agent');

    const shouldArchive =
      isSeedCode ||
      (noScan &&
        (duplicateName ||
          (isSeedCode && duplicateName) ||
          (isSeedCode && noPortsOrCmds) ||
          (seedNotes && noLocal && noPortsOrCmds) ||
          (noLocal && noPortsOrCmds && isSeedCode)));

    if (shouldArchive) {
      await prisma.project.update({
        where: { id: p.id },
        data: { archived: true },
      });
      archived.push(`${p.name} (${p.code})`);
    }
  }

  return archived;
}
