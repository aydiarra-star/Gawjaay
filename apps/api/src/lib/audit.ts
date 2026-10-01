import { prisma } from './prisma.js';

interface AuditInput {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}

/**
 * Journalise une opération sensible (cahier §34).
 * N'échoue jamais la requête métier si l'écriture du log échoue.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ? JSON.stringify(input.meta) : null,
        ip: input.ip ?? null,
      },
    });
  } catch {
    // Le log d'audit ne doit jamais faire échouer une opération métier.
  }
}
