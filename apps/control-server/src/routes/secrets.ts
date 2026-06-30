import { Router } from 'express';

import crypto from 'crypto';

import { prisma } from '../lib/prisma';

import { encryptSecret, previewSecret, decryptSecret } from '../lib/crypto';

import { requireAuth, getActor, getClientIp } from '../middleware/auth';

import {
  requireServiceToken,
  extractServiceToken,
  requireServiceTokenOrAuth,
} from '../middleware/serviceToken';

import { writeOperationLog } from '../services/operationLog';

import { paramId } from '../lib/params';

import {
  resolveQianfanShopIdentity,
  isQianfanTestShopName,
  QIANFAN_CANONICAL_SHOPS,
  buildQianfanShopCards,
  listArchivedOrTestSecrets,
} from '@zhubo/control-shared';

const router = Router();

function hashPrefix(hash?: string | null) {
  return String(hash || '').slice(0, 8);
}

function withQianfanMeta(secret: Record<string, unknown>) {
  const { encryptedValue, ...rest } = secret;

  const shopName = String(rest.shopName || '');

  const rawShopName = String(rest.rawShopName || shopName);

  const identity = resolveQianfanShopIdentity(rawShopName || shopName);

  return {
    ...rest,

    rawShopName: rest.rawShopName || rawShopName,

    canonicalShopName:
      identity.canonicalShopName ||
      (QIANFAN_CANONICAL_SHOPS.includes(shopName as any) ? shopName : null),
  };
}

function sanitizeSecret(secret: Record<string, unknown>) {
  return withQianfanMeta(secret);
}

router.get('/', requireAuth, async (req, res) => {
  const platform = req.query.platform ? String(req.query.platform) : undefined;

  const shopName = req.query.shopName ? String(req.query.shopName) : undefined;

  const includeArchived = req.query.includeArchived === '1';

  const secrets = await prisma.secretStore.findMany({
    where: {
      ...(platform ? { platform } : {}),

      ...(shopName ? { shopName } : {}),

      ...(includeArchived ? {} : { archived: false }),
    },

    orderBy: { updatedAt: 'desc' },
  });

  res.json(secrets.map((s) => sanitizeSecret(s as unknown as Record<string, unknown>)));
});

router.get('/qianfan/shops', requireServiceTokenOrAuth, async (req, res) => {
  const includeArchived = req.query.includeArchived === '1';

  const secrets = await prisma.secretStore.findMany({
    where: { platform: 'qianfan', keyName: 'cookie' },

    orderBy: { updatedAt: 'desc' },
  });

  const sanitized = secrets.map((s) => sanitizeSecret(s as unknown as Record<string, unknown>));

  const active = sanitized.filter((s) => !(s as Record<string, unknown>).archived);

  res.json({
    shops: buildQianfanShopCards(active),

    archived: includeArchived ? listArchivedOrTestSecrets(sanitized) : [],
  });
});

router.post('/maintenance/align-qianfan', requireAuth, async (req, res) => {
  const all = await prisma.secretStore.findMany({
    where: { platform: 'qianfan', keyName: 'cookie' },
  });

  let archived = 0;

  let renamed = 0;

  for (const row of all) {
    const raw = String(row.rawShopName || row.shopName || '');

    const identity = resolveQianfanShopIdentity(raw);

    if (identity.isTest || isQianfanTestShopName(String(row.shopName || ''))) {
      if (!row.archived) {
        await prisma.secretStore.update({
          where: { id: row.id },

          data: { archived: true, rawShopName: raw, notes: row.notes || 'archived:test-or-legacy' },
        });

        archived += 1;
      }

      continue;
    }

    if (identity.canonicalShopName && row.shopName !== identity.canonicalShopName) {
      const dup = await prisma.secretStore.findFirst({
        where: {
          platform: 'qianfan',

          keyName: 'cookie',

          shopName: identity.canonicalShopName,

          archived: false,

          NOT: { id: row.id },
        },
      });

      if (dup) {
        await prisma.secretStore.update({
          where: { id: row.id },
          data: { archived: true, rawShopName: raw },
        });

        archived += 1;
      } else {
        await prisma.secretStore.update({
          where: { id: row.id },

          data: {
            shopName: identity.canonicalShopName,

            rawShopName: raw,

            archived: false,
          },
        });

        renamed += 1;
      }
    } else if (identity.canonicalShopName && !row.rawShopName) {
      await prisma.secretStore.update({
        where: { id: row.id },

        data: { rawShopName: raw || row.shopName },
      });
    }
  }

  await writeOperationLog({
    actor: getActor(req),

    action: 'align_qianfan_secrets',

    targetType: 'secret',

    detail: { archived, renamed },

    ip: getClientIp(req),
  });

  res.json({ ok: true, archived, renamed });
});

router.post('/', requireAuth, async (req, res) => {
  const { scope, platform, shopName, keyName, value, expiresAt, notes, status } = req.body;

  if (!platform || !keyName || !value) {
    return res.status(400).json({ error: '平台、密钥名、值不能为空' });
  }

  const cookieHash = crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

  const identity =
    platform === 'qianfan' ? resolveQianfanShopIdentity(String(shopName || '')) : null;

  const secret = await prisma.secretStore.create({
    data: {
      scope: scope || 'shop',

      platform,

      shopName: identity?.canonicalShopName || shopName,

      rawShopName: identity?.rawShopName || shopName,

      keyName,

      encryptedValue: encryptSecret(value),

      valuePreview: previewSecret(value),

      cookieHash,

      expiresAt: expiresAt ? new Date(expiresAt) : null,

      notes,

      status: status || 'unknown',

      autoUpdated: false,

      archived: identity?.isTest ?? false,

      lastUploadedBy: getActor(req),

      lastSeenAt: new Date(),

      capturedAt: new Date(),
    },
  });

  await writeOperationLog({
    actor: getActor(req),

    action: 'create_secret',

    targetType: 'secret',

    targetId: secret.id,

    detail: { platform, shopName, keyName, cookieHash: hashPrefix(cookieHash) },

    ip: getClientIp(req),
  });

  res.json(sanitizeSecret(secret as unknown as Record<string, unknown>));
});

router.put('/:id', requireAuth, async (req, res) => {
  const { value, archived, ...rest } = req.body;

  const data: Record<string, unknown> = { ...rest };

  if (typeof archived === 'boolean') data.archived = archived;

  if (value) {
    data.encryptedValue = encryptSecret(value);

    data.valuePreview = previewSecret(value);

    data.cookieHash = crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
  }

  if (rest.expiresAt) data.expiresAt = new Date(rest.expiresAt);

  const secret = await prisma.secretStore.update({ where: { id: paramId(req) }, data });

  await writeOperationLog({
    actor: getActor(req),

    action: 'update_secret',

    targetType: 'secret',

    targetId: secret.id,

    ip: getClientIp(req),
  });

  res.json(sanitizeSecret(secret as unknown as Record<string, unknown>));
});

router.post('/:id/test', requireAuth, async (req, res) => {
  const secret = await prisma.secretStore.findUnique({ where: { id: paramId(req) } });

  if (!secret) return res.status(404).json({ error: '不存在' });

  const value = decryptSecret(secret.encryptedValue);

  const ok = value.length > 10;

  await prisma.secretStore.update({
    where: { id: secret.id },

    data: { status: ok ? 'valid' : 'invalid', lastValidatedAt: new Date() },
  });

  res.json({ ok, message: ok ? 'Cookie 格式看起来正常' : 'Cookie 太短或无效' });
});

router.post('/qianfan/upload-cookie', requireServiceToken, async (req, res) => {
  const {
    platform,

    shopName,

    shopId,

    accountName,

    cookie,

    cookieHash,

    source,

    collectorMachine,

    collectorProject,

    lastSeenUrl,

    capturedAt,
  } = req.body || {};

  if (platform !== 'qianfan') {
    return res.status(400).json({ error: 'platform 必须是 qianfan' });
  }

  if (!shopName || !String(shopName).trim()) {
    return res.status(400).json({ error: 'shopName 不能为空' });
  }

  if (!cookie || !String(cookie).trim()) {
    return res.status(400).json({ error: 'cookie 不能为空' });
  }

  const identity = resolveQianfanShopIdentity(String(shopName));

  const rawShopName = identity.rawShopName;

  const canonicalShopName = identity.canonicalShopName;

  const storeShopName = canonicalShopName || rawShopName;

  const shouldArchive = identity.isTest && !canonicalShopName;

  const normalizedHash =
    String(cookieHash || '').trim() ||
    crypto.createHash('sha256').update(String(cookie), 'utf8').digest('hex');

  const now = new Date();

  const captured = capturedAt ? new Date(capturedAt) : now;

  const actor = String(collectorProject || '千帆中转机器人');

  const existing = await prisma.secretStore.findFirst({
    where: {
      platform: 'qianfan',

      keyName: 'cookie',

      shopName: storeShopName,
    },

    orderBy: { updatedAt: 'desc' },
  });

  let secret;

  let unchanged = false;

  const baseUpdate = {
    shopId: shopId ? String(shopId) : existing?.shopId,

    accountName: accountName ? String(accountName) : existing?.accountName,

    rawShopName,

    archived: shouldArchive,

    lastSeenAt: now,

    capturedAt: captured,

    lastUploadedBy: actor,

    collectorMachine: collectorMachine ? String(collectorMachine) : existing?.collectorMachine,

    collectorSource: source ? String(source) : existing?.collectorSource || 'qianfan-relay-cdp',

    status: 'valid',

    autoUpdated: true,

    notes: lastSeenUrl ? `lastSeenUrl=${lastSeenUrl}` : existing?.notes,
  };

  if (existing && existing.cookieHash === normalizedHash) {
    unchanged = true;

    secret = await prisma.secretStore.update({
      where: { id: existing.id },

      data: baseUpdate,
    });
  } else if (existing) {
    secret = await prisma.secretStore.update({
      where: { id: existing.id },

      data: {
        ...baseUpdate,

        shopName: storeShopName,

        encryptedValue: encryptSecret(String(cookie)),

        valuePreview: previewSecret(String(cookie)),

        cookieHash: normalizedHash,
      },
    });
  } else {
    secret = await prisma.secretStore.create({
      data: {
        scope: 'shop',

        platform: 'qianfan',

        shopName: storeShopName,

        rawShopName,

        shopId: shopId ? String(shopId) : null,

        accountName: accountName ? String(accountName) : null,

        keyName: 'cookie',

        encryptedValue: encryptSecret(String(cookie)),

        valuePreview: previewSecret(String(cookie)),

        cookieHash: normalizedHash,

        archived: shouldArchive,

        lastSeenAt: now,

        capturedAt: captured,

        lastUploadedBy: actor,

        collectorMachine: collectorMachine ? String(collectorMachine) : null,

        collectorSource: source ? String(source) : 'qianfan-relay-cdp',

        status: 'valid',

        autoUpdated: true,

        notes: lastSeenUrl ? `lastSeenUrl=${lastSeenUrl}` : null,
      },
    });
  }

  await writeOperationLog({
    actor,

    action: 'qianfan_cookie_upload',

    targetType: 'secret',

    targetId: secret.id,

    detail: {
      shopName: storeShopName,

      rawShopName,

      canonicalShopName,

      cookieHash: hashPrefix(normalizedHash),

      capturedAt: captured.toISOString(),

      unchanged,

      archived: shouldArchive,

      collectorMachine: collectorMachine || null,
    },

    ip: getClientIp(req),
  });

  res.json({
    ok: true,

    unchanged,

    id: secret.id,

    shopName: secret.shopName,

    rawShopName,

    canonicalShopName,

    archived: secret.archived,

    cookieHash: hashPrefix(secret.cookieHash),

    updatedAt: secret.updatedAt,
  });
});

router.get('/resolve', requireServiceToken, async (req, res) => {
  const platform = String(req.query.platform || '');

  const shopName = req.query.shopName ? String(req.query.shopName) : undefined;

  const keyName = String(req.query.keyName || 'cookie');

  const projectName = String(req.headers['x-project-name'] || req.query.projectName || 'service');

  if (!platform) return res.status(400).json({ error: 'platform 不能为空' });

  const lookupName =
    platform === 'qianfan' && shopName
      ? resolveQianfanShopIdentity(shopName).canonicalShopName || shopName
      : shopName;

  const secret = await prisma.secretStore.findFirst({
    where: {
      platform,

      shopName: lookupName ?? null,

      keyName,

      archived: false,
    },

    orderBy: { updatedAt: 'desc' },
  });

  if (!secret) return res.status(404).json({ error: '未找到密钥' });

  await prisma.secretAccessLog.create({
    data: {
      actor: projectName,

      platform,

      shopName: lookupName,

      keyName,

      ip: getClientIp(req),

      userAgent: String(req.headers['user-agent'] || ''),
    },
  });

  await writeOperationLog({
    actor: projectName,

    action: 'secret_resolve',

    targetType: 'secret',

    targetId: secret.id,

    detail: {
      platform,

      shopName: lookupName,

      keyName,

      cookieHash: hashPrefix(secret.cookieHash),
    },

    ip: getClientIp(req),
  });

  res.json({
    ok: true,

    platform,

    shopName: secret.shopName,

    rawShopName: secret.rawShopName,

    keyName: secret.keyName,

    value: decryptSecret(secret.encryptedValue),

    updatedAt: secret.updatedAt,

    lastUploadedBy: secret.lastUploadedBy,

    cookieHash: hashPrefix(secret.cookieHash),
  });
});

router.get('/audit', requireAuth, async (_req, res) => {
  const logs = await prisma.secretAccessLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });

  res.json(logs);
});

export default router;
