import db from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';

/**
 * LOT B — Analytics avancés.
 *
 * RÈGLE FINANCE : n'afficher que des indicateurs réellement calculables.
 * - "chiffreAffaires" = somme des ventes réelles.
 * - "depenses" = dépenses saisies réelles.
 * - "margeEstimee" = uniquement pour les produits dont le prix d'achat est renseigné,
 *   avec un taux de couverture affiché. JAMAIS appelée "bénéfice".
 */

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); }

export async function storeAnalytics(user: any, storeId: string, opts: { from?: string; to?: string } = {}) {
  assertStoreAccess(storeId, user);

  const now = new Date();
  const today = startOfDay(now);
  const d7 = startOfDay(new Date(now.getTime() - 7 * 86400000));
  const d30 = startOfDay(new Date(now.getTime() - 30 * 86400000));
  const from = opts.from ? new Date(opts.from).toISOString() : d30;
  const to = opts.to ? new Date(opts.to).toISOString() : now.toISOString();

  const salesAgg = (since: string, until?: string) => {
    let sql = 'SELECT COUNT(*) as count, COALESCE(SUM(totalAmount),0) as total FROM sales WHERE storeId = ? AND createdAt >= ?';
    const params: any[] = [storeId, since];
    if (until) { sql += ' AND createdAt < ?'; params.push(until); }
    return db.prepare(sql).get(...params) as any;
  };

  const todayAgg = salesAgg(today);
  const weekAgg = salesAgg(d7);
  const monthAgg = salesAgg(d30);
  const periodAgg = salesAgg(from, to);

  // Produits : top/flop par chiffre d'affaires et quantités sur la période
  const productRows = db.prepare(`
    SELECT p.id, p.name, p.price, COALESCE(p.costPrice, NULL) as costPrice,
           SUM(si.quantity) as qtySold, SUM(si.total) as revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.saleId
    JOIN products p ON p.id = si.productId
    WHERE s.storeId = ? AND s.createdAt >= ? AND s.createdAt < ?
    GROUP BY p.id ORDER BY revenue DESC
  `).all(storeId, from, to) as any[];

  const stockRows = db.prepare(`
    SELECT p.id, p.name, COALESCE(i.quantity,0) as stock, p.lowStockThreshold, p.stockMax
    FROM products p LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    WHERE p.storeId = ? AND p.isActive = 1
  `).all(storeId) as any[];

  // rotation : quantité vendue sur 30 jours / stock actuel (si stock > 0)
  const sales30 = db.prepare(`
    SELECT productId, SUM(si.quantity) as qty FROM sale_items si
    JOIN sales s ON s.id = si.saleId
    WHERE s.storeId = ? AND s.createdAt >= ?
    GROUP BY productId`).all(storeId, d30) as any[];
  const soldMap = new Map(sales30.map((r: any) => [r.productId, r.qty]));

  // dernier mouvement de sortie (dormance)
  const lastOut = db.prepare(`
    SELECT productId, MAX(createdAt) as lastAt FROM inventory_movements
    WHERE storeId = ? AND quantity < 0 GROUP BY productId`).all(storeId) as any[];
  const lastOutMap = new Map(lastOut.map((r: any) => [r.productId, r.lastAt]));
  const dormanceLimit = now.getTime() - 30 * 86400000;

  const products = {
    topRevenue: productRows.slice(0, 10),
    topQty: [...productRows].sort((a: any, b: any) => b.qtySold - a.qtySold).slice(0, 10),
    leastSold: [...productRows].sort((a: any, b: any) => a.qtySold - b.qtySold).slice(0, 10),
    totalRevenue: productRows.reduce((s: number, r: any) => s + (r.revenue || 0), 0),
  };

  const stock = {
    underThreshold: stockRows.filter((r: any) => r.stock <= (r.lowStockThreshold ?? 5)),
    overMax: stockRows.filter((r: any) => r.stockMax != null && r.stock > r.stockMax),
    dormant: stockRows.filter((r: any) => {
      const last = lastOutMap.get(r.id);
      const sold = soldMap.get(r.id) || 0;
      if (sold > 0) return false;
      if (!last) return r.stock > 0; // jamais de sortie
      return new Date(last).getTime() < dormanceLimit;
    }),
    rotation: stockRows.map((r: any) => {
      const sold30 = soldMap.get(r.id) || 0;
      return {
        productId: r.id, name: r.name, stock: r.stock, sold30,
        rotationDays: sold30 > 0 ? Math.round((r.stock / sold30) * 30) : null,
      };
    }).sort((a: any, b: any) => (b.sold30 / (b.stock || 1)) - (a.sold30 / (a.stock || 1))).slice(0, 20),
    movements: db.prepare('SELECT * FROM inventory_movements WHERE storeId = ? ORDER BY createdAt DESC LIMIT 20').all(storeId),
  };

  // Clients : nouveaux vs récurrents sur la période (ventes + commandes)
  const customerRows = db.prepare(`
    SELECT c.id, c.name, c.phone,
           COUNT(s.id) as salesCount, COALESCE(SUM(s.totalAmount),0) as totalSpent,
           MIN(s.createdAt) as firstSale, MAX(s.createdAt) as lastSale
    FROM customers c
    LEFT JOIN sales s ON s.customerId = c.id AND s.createdAt >= ? AND s.createdAt < ?
    WHERE c.storeId = ?
    GROUP BY c.id ORDER BY totalSpent DESC LIMIT 50
  `).all(from, to, storeId) as any[];
  const active = customerRows.filter((c: any) => c.salesCount > 0);
  const clients = {
    activeCount: active.length,
    newCount: active.filter((c: any) => new Date(c.firstSale) >= new Date(from)).length,
    recurringCount: active.filter((c: any) => c.salesCount >= 2).length,
    top: customerRows.slice(0, 10),
    averageBasket: periodAgg.count > 0 ? Math.round((periodAgg.total / periodAgg.count) * 100) / 100 : 0,
  };

  // Finance : uniquement du calculable et étiqueté honnêtement
  const expensesAgg = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE storeId = ? AND date >= ? AND date < ?').get(storeId, from, to) as any;
  const costKnown = productRows.filter((r: any) => r.costPrice != null);
  const margeEstimee = costKnown.reduce((s: number, r: any) => s + (r.price - r.costPrice) * r.qtySold, 0);
  const finance = {
    revenue: periodAgg.total,
    expenses: expensesAgg.total,
    margeEstimee: costKnown.length ? margeEstimee : null,
    margeCoverage: productRows.length ? Math.round((costKnown.length / productRows.length) * 100) : 0,
    note: costKnown.length < productRows.length
      ? `Marge estimée sur ${costKnown.length}/${productRows.length} produits uniquement (prix d'achat renseigné). Ce n'est pas un bénéfice comptable.`
      : "Marge estimée (prix de vente - prix d'achat). Ce n'est pas un bénéfice comptable.",
  };

  return {
    period: { from, to },
    sales: {
      today: { count: todayAgg.count, total: todayAgg.total },
      last7days: { total: weekAgg.total },
      last30days: { total: monthAgg.total },
      custom: { count: periodAgg.count, total: periodAgg.total },
      trend: buildTrend(storeId, from, to),
    },
    products,
    stock,
    clients,
    finance,
  };
}

function buildTrend(storeId: string, from: string, to: string) {
  const trend: any[] = [];
  const start = new Date(from);
  const end = new Date(to);
  let guard = 0;
  while (start < end && guard++ < 60) {
    const next = new Date(start); next.setDate(next.getDate() + 1);
    const agg = db.prepare('SELECT COALESCE(SUM(totalAmount),0) as total, COUNT(*) as count FROM sales WHERE storeId = ? AND createdAt >= ? AND createdAt < ?')
      .get(storeId, start.toISOString(), next.toISOString()) as any;
    trend.push({ date: start.toISOString().slice(0, 10), total: agg.total, count: agg.count });
    start.setDate(start.getDate() + 1);
  }
  return trend;
}
