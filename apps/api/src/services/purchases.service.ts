import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { applyStockChange } from './inventory.service.js';

/**
 * Réception d'un achat fournisseur (cahier §21) : le stock n'est augmenté QU'À la confirmation
 * de réception, de façon transactionnelle.
 */
export async function receivePurchase(tx: Tx, orgId: string, purchaseId: string, userId: string | null) {
  const purchase = await tx.purchase.findFirst({
    where: { id: purchaseId, organizationId: orgId },
    include: { items: true },
  });
  if (!purchase) throw AppError.notFound('Achat introuvable');
  if (purchase.status === 'RECEIVED') throw AppError.conflict('Achat déjà réceptionné');
  if (purchase.status === 'CANCELLED') throw AppError.conflict('Achat annulé');
  if (purchase.items.length === 0) throw AppError.badRequest('Aucun article à réceptionner');

  for (const item of purchase.items) {
    await applyStockChange(tx, {
      storeId: purchase.storeId,
      variantId: item.variantId,
      quantity: item.quantity,
      type: 'ENTRY',
      userId,
      reference: purchase.id,
      note: 'Réception achat fournisseur',
    });
  }

  await tx.purchase.update({
    where: { id: purchase.id },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  });

  return { purchaseId: purchase.id, items: purchase.items.length };
}

/** Reste dû fournisseur (total - paiements réussis). */
export async function purchaseOutstanding(tx: Tx, purchaseId: string): Promise<number> {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { payments: true } });
  if (!purchase) throw AppError.notFound('Achat introuvable');
  const paid = purchase.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
  return Math.max(0, purchase.total - paid);
}
