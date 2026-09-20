import db from '../../lib/db';

function todayIso() {
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString();
}

export async function getDashboard(storeId: string) {
  const today = todayIso();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7); weekAgo.setHours(0,0,0,0);
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth()-1); monthAgo.setHours(0,0,0,0);

  const salesToday = db.prepare('SELECT COUNT(*) as cnt, SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ?').get(storeId, today) as any;
  const salesWeek = db.prepare('SELECT SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ?').get(storeId, weekAgo.toISOString()) as any;
  const salesMonth = db.prepare('SELECT SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ?').get(storeId, monthAgo.toISOString()) as any;
  const ordersPending = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE storeId = ? AND status IN ('EN_ATTENTE','CONFIRMEE','EN_PREPARATION')").get(storeId) as any;
  const inventories = db.prepare('SELECT i.quantity, p.lowStockThreshold FROM inventories i JOIN products p ON p.id = i.productId WHERE i.storeId = ?').all(storeId) as any[];
  const lowStock = inventories.filter(i=> i.quantity <= (i.lowStockThreshold||5)).length;
  const customers = db.prepare('SELECT id FROM customers WHERE storeId = ?').all(storeId) as any[];
  let debts = { count: 0, total: 0 };
  if (customers.length) {
    const placeholders = customers.map(()=>'?').join(',');
    const agg = db.prepare(`SELECT COUNT(*) as cnt, SUM(balance) as total FROM debts WHERE customerId IN (${placeholders}) AND isSettled = 0`).get(...customers.map(c=>c.id)) as any;
    debts = { count: agg.cnt, total: agg.total || 0 };
  }
  const expensesToday = db.prepare('SELECT SUM(amount) as total FROM expenses WHERE storeId = ? AND date >= ?').get(storeId, today) as any;

  const trend = [];
  for (let i=6;i>=0;i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    const next = new Date(d); next.setDate(next.getDate()+1);
    const agg = db.prepare('SELECT SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ? AND createdAt < ?').get(storeId, d.toISOString(), next.toISOString()) as any;
    trend.push({ date: d.toISOString().slice(0,10), total: agg.total || 0 });
  }

  return {
    today: { salesCount: salesToday.cnt, salesAmount: salesToday.total || 0, expenses: expensesToday.total || 0, ordersPending: ordersPending.cnt, lowStock, debts },
    week: { salesAmount: salesWeek.total || 0 },
    month: { salesAmount: salesMonth.total || 0 },
    trend
  };
}

export async function merchantOverview(merchantId: string) {
  const stores = db.prepare('SELECT id FROM stores WHERE merchantId = ?').all(merchantId) as any[];
  const storeIds = stores.map(s=>s.id);
  if (!storeIds.length) return { storesCount: 0, totalSales: 0, salesCount: 0, orders: 0 };
  const placeholders = storeIds.map(()=>'?').join(',');
  const sales = db.prepare(`SELECT COUNT(*) as cnt, SUM(totalAmount) as total FROM sales WHERE storeId IN (${placeholders})`).get(...storeIds) as any;
  const orders = db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE storeId IN (${placeholders})`).get(...storeIds) as any;
  return { storesCount: stores.length, totalSales: sales.total || 0, salesCount: sales.cnt, orders: orders.cnt };
}
