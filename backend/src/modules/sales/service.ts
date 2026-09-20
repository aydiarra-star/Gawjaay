import db, { cuid } from '../../lib/db';
import { applyPromotions, consumePromotion } from '../promotions/service';
import { validateCoupon, consumeCoupon } from '../coupons/service';
import { maybeNotifyLowStock } from '../inventory/service';
import * as loyalty from '../loyalty/service';
function nowIso(){ return new Date().toISOString(); }

export async function createSale(storeId: string, data: any, userId: string) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });

  // V2 : prix promotionnels calculés serveur (sauf prix POS surchargé par le commerçant)
  const promoResult = applyPromotions(storeId, data.items);
  const lineByProduct = new Map(promoResult.lines.map((l: any) => [l.productId, l]));

  let total = 0;
  const itemsData: any[] = [];
  const usedPromotionIds: string[] = [];
  for (const it of data.items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as any;
    if (!product || product.storeId !== storeId) throw Object.assign(new Error(`Produit ${it.productId} introuvable`), { status: 404 });
    const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, it.productId) as any;
    if (!inv || inv.quantity < it.quantity) throw Object.assign(new Error(`Stock insuffisant pour ${product.name}`), { status: 400 });
    const line: any = lineByProduct.get(it.productId);
    let unitPrice: number;
    if (it.unitPrice !== undefined && it.unitPrice !== null) {
      unitPrice = it.unitPrice; // prix POS négocié par le commerçant (jamais par un client : route réservée MERCHANT/EMPLOYEE)
    } else {
      unitPrice = line.unitPriceFinal; // prix serveur (promo appliquée si avantageuse)
      if (line.promotionId) usedPromotionIds.push(line.promotionId);
    }
    const lineTotal = unitPrice * it.quantity;
    total += lineTotal;
    itemsData.push({ productId: it.productId, quantity: it.quantity, unitPrice, total: lineTotal });
  }

  // V2 : coupon validé côté serveur puis consommé immédiatement (vente = définitive)
  let coupon: any = null;
  let couponDiscount = 0;
  if (data.couponCode) {
    const subtotal = total;
    const check = validateCoupon(storeId, data.couponCode, { subtotal });
    if (!check.ok) throw Object.assign(new Error(check.reason || 'Coupon invalide'), { status: 400 });
    coupon = check.coupon;
    couponDiscount = check.discount || 0;
  }

  const discount = data.discount || 0;
  const finalTotal = Math.max(0, total - couponDiscount - discount);
  const amountPaid = data.amountPaid ?? finalTotal;
  const change = amountPaid - finalTotal;

  if (data.paymentMethod === 'CREDIT' && !data.customerId) throw Object.assign(new Error('Client requis pour vente à crédit'), { status: 400 });

  const saleId = cuid();
  db.prepare('INSERT INTO sales (id, storeId, customerId, totalAmount, discount, paymentMethod, amountPaid, change, notes, createdById, promotionIds, couponId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(saleId, storeId, data.customerId || null, finalTotal, discount + couponDiscount, data.paymentMethod || 'CASH', amountPaid, change > 0 ? change : 0, data.notes || null, userId,
      usedPromotionIds.length ? JSON.stringify([...new Set(usedPromotionIds)]) : null,
      coupon ? coupon.id : null, nowIso());

  for (const it of itemsData) {
    const itemId = cuid();
    db.prepare('INSERT INTO sale_items (id, saleId, productId, quantity, unitPrice, total) VALUES (?,?,?,?,?,?)')
      .run(itemId, saleId, it.productId, it.quantity, it.unitPrice, it.total);
    const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, it.productId) as any;
    db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity - it.quantity, nowIso(), inv.id);
    db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(cuid(), storeId, it.productId, -it.quantity, 'SALE', saleId, 'Vente physique', userId, nowIso());
    await maybeNotifyLowStock(storeId, it.productId, userId);
  }

  for (const pid of [...new Set(usedPromotionIds)]) {
    if (!consumePromotion(pid)) throw Object.assign(new Error('Promotion devenue indisponible'), { status: 400 });
  }
  if (coupon) consumeCoupon(coupon.id, saleId, storeId, data.customerId || null, couponDiscount);

  // V2 LOT C : points sur le montant réellement encaissé (hors crédit partiel)
  if (amountPaid > 0 && data.paymentMethod !== 'CREDIT' && data.clientUserId) {
    loyalty.earnForPurchase(storeId, data.clientUserId, Math.min(amountPaid, finalTotal), saleId, data.customerId || null);
  }

  if (data.paymentMethod === 'CREDIT' || amountPaid < finalTotal) {
    const balance = finalTotal - amountPaid;
    if (balance > 0) {
      const debtId = cuid();
      db.prepare('INSERT INTO debts (id, customerId, totalAmount, paidAmount, balance, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
        .run(debtId, data.customerId, finalTotal, amountPaid, balance, `Vente ${saleId}`, nowIso(), nowIso());
    }
  }

  return db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
}

export async function listSales(storeId: string, take=50, skip=0) {
  return db.prepare('SELECT * FROM sales WHERE storeId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(storeId, take, skip);
}

export async function getSale(id: string) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as any;
  if (!sale) return null;
  const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id);
  return { ...sale, items };
}
