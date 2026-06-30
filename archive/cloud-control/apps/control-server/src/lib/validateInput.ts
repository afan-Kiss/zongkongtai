import { z } from 'zod';

const FORBIDDEN_URL = /xiangyuzhubao\.xyz|wss:\/\//i;

const urlField = z
  .string()
  .max(2048)
  .optional()
  .nullable()
  .refine((v) => !v || !FORBIDDEN_URL.test(v), {
    message: 'URL 不允许使用未备案域名或 wss',
  });

const DANGEROUS_COMMAND = [
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/s\b/i,
  /\brd\s+\/s\b/i,
  /\brm\s+-rf\b/i,
  /\bshutdown\b/i,
  /\breg\s+delete\b/i,
  /Invoke-WebRequest[^\n\r]{0,200}-OutFile[^\n\r]{0,200}\.(exe|bat|ps1)/i,
];

function assertSafeCommand(value: string, field: string) {
  for (const re of DANGEROUS_COMMAND) {
    if (re.test(value)) {
      throw new Error(`${field} 包含高风险命令片段，已被拒绝`);
    }
  }
}

const commandField = z
  .string()
  .max(4000)
  .optional()
  .nullable()
  .superRefine((v, ctx) => {
    if (!v) return;
    try {
      assertSafeCommand(v, '命令');
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : '命令不安全',
      });
    }
  });

export const projectInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    code: z.string().min(1).max(100).optional(),
    description: z.string().max(5000).optional().nullable(),
    category: z.string().max(200).optional().nullable(),
    locationType: z.string().max(50).optional(),
    localPath: z.string().max(1024).optional().nullable(),
    serverPath: z.string().max(1024).optional().nullable(),
    gitRemote: z.string().max(1024).optional().nullable(),
    branch: z.string().max(200).optional().nullable(),
    packageManager: z.string().max(50).optional(),
    startCommand: commandField,
    devCommand: commandField,
    desktopStartCommand: commandField,
    buildCommand: commandField,
    deployCommand: commandField,
    pm2Name: z.string().max(200).optional().nullable(),
    healthUrl: urlField,
    localWebUrl: urlField,
    localHealthUrl: urlField,
    publicUrl: urlField,
    internalUrl: urlField,
    status: z.string().max(50).optional(),
    owner: z.string().max(200).optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
    archived: z.boolean().optional(),
  })
  .strict();

export const commandInputSchema = z
  .object({
    projectId: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    command: z
      .string()
      .min(1)
      .max(4000)
      .superRefine((v, ctx) => {
        try {
          assertSafeCommand(v, 'command');
        } catch (e) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: e instanceof Error ? e.message : '命令不安全',
          });
        }
      }),
    cwd: z.string().max(1024).optional().nullable(),
    envJson: z.string().max(16000).optional().nullable(),
    type: z.string().max(50).optional(),
    agentId: z.string().max(64).optional().nullable(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const projectCreateSchema = projectInputSchema
  .extend({
    name: z.string().min(1).max(200),
    code: z.string().min(1).max(100),
  })
  .strict();

export const projectUpdateSchema = projectInputSchema.partial().strict();

export function parseProjectCreate(body: unknown) {
  return projectCreateSchema.parse(body);
}

export function parseProjectUpdate(body: unknown) {
  return projectUpdateSchema.parse(body);
}

export const commandUpdateSchema = commandInputSchema.omit({ projectId: true }).partial().strict();

export function parseCommandInput(body: unknown) {
  return commandInputSchema.parse(body);
}

export function parseCommandUpdate(body: unknown) {
  return commandUpdateSchema.parse(body);
}

export function formatZodError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => i.message).join('；');
  }
  return err instanceof Error ? err.message : '参数校验失败';
}
