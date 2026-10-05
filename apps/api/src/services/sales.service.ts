import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { applyStockChange } from './inventory.service.js';
import { effectiveUnitPrice, consumeFlashOffer } from './flash-offers.service.js';

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
  /** Clé d'idempotence générée par le client (POS). */
  clientRequestId?: string | null;
}

interface SaleSummary {
  saleId: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  replayed?: boolean;
}

function summarizeSale(sale: {
  id: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  payments: Array<{ amount: number; status: string; method: string }>;
}): SaleSummary {
  const paid = sale.payments
    .filter((p) => p.status === 'SUCCESSFUL')
    .reduce((sum, p) => sum + p.amount, 0);
  return {
    saleId: sale.id,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    paid,
    remaining: Math.max(0, sale.total - paid),
    replayed: true,
  };
}

export async function createSale(tx: Tx, orgId: string, input: CreateSaleInput) {
  if (input.items.length === 0) throw AppError.badRequest('La vente doit contenir au moins un article');

  const clientRequestId = input.clientRequestId?.trim() || null;
  if (clientRequestId) {
    const existing = await tx.sale.findFirst({
      where: { storeId: input.storeId, clientRequestId },
      include: { payments: true },
    });
    if (existing) return summarizeSale(existing);
  }

  const variantIds = input.items.map((i) => i.variantId);
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, product: { organizationId: orgId } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let subtotal = 0;
  const lines = [] as Array<{
    variantId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    unitCost: number;
    packaging: string;
    format: string | null;
    flashOfferId: string | null;
  }>;

  for (const item of input.items) {
    const variant = byId.get(item.variantId);
    if (!variant) throw AppError.badRequest(`Variante inconnue: ${item.variantId}`);
    const quantity = Math.round(item.quantity);
    if (quantity <= 0) throw AppError.badRequest('Quantité invalide');

    const resolved = await effectiveUnitPrice(tx, input.storeId, variant);
    const unitPrice = resolved.price;
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;

    lines.push({
      variantId: variant.id,
      name: variant.name,
      quantity,
      unitPrice,
      lineTotal,
      unitCost: variant.product.purchasePrice ?? 0,
      packaging: variant.product.packaging,
      format: variant.product.format,
      flashOfferId: resolved.flash?.id ?? null,
    });
  }

  const discount = Math.max(0, Math.round(input.discount ?? 0));
  if (discount > subtotal) throw AppError.badRequest('La remise dépasse le sous-total');
  const total = subtotal - discount;

  const paid = input.payments.reduce((sum, p) => sum + Math.max(0, Math.round(p.amount)), 0);
  if (paid > total) throw AppError.badRequest('Le montant payé dépasse le total');

  // Flash Offer et stock sont consommés dans la même transaction : toute erreur
  // ultérieure annule les deux, sans vente partiellement enregistrée.
  for (const line of lines) {
    if (line.flashOfferId) await consumeFlashOffer(tx, line.flashOfferId, line.quantity);
  }

  const sale = await tx.sale.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      customerId: input.customerId ?? null,
      subtotal,
      discount,
      total,
      status: 'COMPLETED',
      clientRequestId,
    },
  });

  for (const line of lines) {
    const { packaging, format, flashOfferId, ...saleItem } = line;
    void packaging;
    void format;
    void flashOfferId;
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

  const remaining = total - paid;
  if (remaining > 0) {
    if (!input.customerId) {
      throw AppError.badRequest('Une vente à crédit nécessite un client identifié');
    }
    await tx.salePayment.create({
      data: { saleId: sale.id, amount: remaining, method: 'CREDIT', status: 'PENDING' },
    });
  }

  return { saleId: sale.id, subtotal, discount, total, paid, remaining, lines, replayed: false };
}

export async function saleOutstanding(tx: Tx, saleId: string): Promise<number> {
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { payments: true } });
  if (!sale) throw AppError.notFound('Vente introuvable');
  const paid = sale.payments
    .filter((p) => p.status === 'SUCCESSFUL')
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, sale.total - paid);
}

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

export async function refundSale(
  tx: Tx,
  orgId: string,
  saleId: string,
  userId: string | null,
  note?: string,
) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, store: { organizationId: orgId } },
    include: { items: true },
  });
  if (!sale) throw AppError.notFound('Vente introuvable');
  if (sale.status === 'REFUNDED') throw AppError.conflict('Cette vente a déjà été remboursée');

  for (const item of sale.items) {
    await applyStockChange(tx, {
      storeId: sale.storeId,
      variantId: item.variantId,
      quantity: item.quantity,
      type: 'RETURN',
      userId,
      reference: sale.id,
      note: note ?? 'Remboursement vente',
    });
  }

  await tx.sale.update({
    where: { id: sale.id },
    data: { status: 'REFUNDED', refundedAt: new Date() },
  });

  return { saleId: sale.id, status: 'REFUNDED', restockedItems: sale.items.length };
}
