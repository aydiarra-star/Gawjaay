import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { applyStockChange } from './inventory.service.js';

export interface SaleLineInput {
  variantId: string;
  quantity: number;
}

export interface CreateSaleInput {
  storeId: string;
  userId: string;
  customerId?: string | null;
  items: SaleLineInput[];
  /** Remise globale en FCFA. */
  discount?: number;
  /** Paiements encaissés (méthode + montant). Un crédit laisse un reste dû. */
  payments: Array<{ method: string; amount: number }>;
}

/**
 * Crée une vente POS de façon transactionnelle (cahier §16, §36) :
 * 1. vérifie l'appartenance des variantes à l'organisation ;
 * 2. calcule les totaux À PARTIR DES PRIX SERVEUR (jamais du client) ;
 * 3. décrémente le stock (refus si insuffisant) ;
 * 4. enregistre les lignes et les paiements.
 *
 * Le prix d'une ligne provient de la variante ou du produit ; le client ne fournit que des quantités.
 */
export async function createSale(tx: Tx, orgId: string, input: CreateSaleInput) {
  if (input.items.length === 0) throw AppError.badRequest('La vente doit contenir au moins un article');

  const variantIds = input.items.map((i) => i.variantId);
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, product: { organizationId: orgId } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const variant = byId.get(item.variantId);
    if (!variant) throw AppError.badRequest(`Variante inconnue: ${item.variantId}`);
    const quantity = Math.round(item.quantity);
    if (quantity <= 0) throw AppError.badRequest('Quantité invalide');
    const unitPrice = variant.price ?? variant.product.price;
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    return {
      variantId: variant.id,
      name: variant.name,
      quantity,
      unitPrice,
      lineTotal,
      packaging: variant.product.packaging,
      format: variant.product.format,
    };
  });

  const discount = Math.max(0, Math.round(input.discount ?? 0));
  if (discount > subtotal) throw AppError.badRequest('La remise dépasse le sous-total');
  const total = subtotal - discount;

  const paid = input.payments.reduce((sum, p) => sum + Math.max(0, Math.round(p.amount)), 0);
  if (paid > total) throw AppError.badRequest('Le montant payé dépasse le total');

  // Référence de vente pour l'historique de stock.
  const sale = await tx.sale.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      customerId: input.customerId ?? null,
      subtotal,
      discount,
      total,
      status: 'COMPLETED',
    },
  });

  for (const line of lines) {
    const { packaging, format, ...saleItem } = line;
    void packaging;
    void format;
    await tx.saleItem.create({ data: { saleId: sale.id, ...saleItem } });
    await applyStockChange(tx, {
      storeId: input.storeId,
      variantId: line.variantId,
      quantity: line.quantity,
      type: 'SALE',
      userId: input.userId,
      reference: sale.id,
    });
  }

  for (const payment of input.payments) {
    const amount = Math.max(0, Math.round(payment.amount));
    if (amount <= 0) continue;
    await tx.salePayment.create({
      data: { saleId: sale.id, amount, method: payment.method, status: 'SUCCESSFUL' },
    });
  }

  // Crédit client : reste dû enregistré comme paiement CREDIT en attente.
  const remaining = total - paid;
  if (remaining > 0) {
    if (!input.customerId) {
      throw AppError.badRequest('Une vente à crédit nécessite un client identifié');
    }
    await tx.salePayment.create({
      data: { saleId: sale.id, amount: remaining, method: 'CREDIT', status: 'PENDING' },
    });
  }

  return { saleId: sale.id, subtotal, discount, total, paid, remaining, lines };
}

/** Reste dû d'une vente (total - paiements réussis). */
export async function saleOutstanding(tx: Tx, saleId: string): Promise<number> {
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { payments: true } });
  if (!sale) throw AppError.notFound('Vente introuvable');
  const paid = sale.payments
    .filter((p) => p.status === 'SUCCESSFUL')
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, sale.total - paid);
}

/** Encaisse un règlement de crédit client sur une vente. */
export async function collectSalePayment(
  tx: Tx,
  orgId: string,
  saleId: string,
  payment: { method: string; amount: number },
) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, store: { organizationId: orgId } },
    include: { payments: true },
  });
  if (!sale) throw AppError.notFound('Vente introuvable');

  const outstanding = await saleOutstanding(tx, saleId);
  const amount = Math.round(payment.amount);
  if (amount <= 0) throw AppError.badRequest('Montant invalide');
  if (amount > outstanding) throw AppError.badRequest('Le montant dépasse le reste dû');

  await tx.salePayment.create({
    data: { saleId, amount, method: payment.method, status: 'SUCCESSFUL' },
  });
  return { outstanding: outstanding - amount };
}
