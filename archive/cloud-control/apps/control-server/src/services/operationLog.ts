import { prisma } from '../lib/prisma';

export async function writeOperationLog(input: {
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
  ip?: string;
}) {
  await prisma.operationLog.create({
    data: {
      actor: input.actor,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detailJson: input.detail ? JSON.stringify(input.detail) : null,
      ip: input.ip,
    },
  });
}
