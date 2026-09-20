import db from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';

/**
 * LOT B — Exports CSV (respect du tenant obligatoire).
 * Types : sales | products | stock | orders | customers | expenses
 */

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: any[][]): string {
  const sep = ';';
  const lines = [headers.join(sep)];
  for (const row of rows) lines.push(row.map(csvEscape).join(sep));
  return '\uFEFF' + lines.join('\n'); // BOM pour Excel
}

export function exportCsv(user: any, storeId: string, type: string): string {
  assertStoreAccess(storeId, user);
  switch (type) {
    case 'sales': {
      const rows = db.prepare(`
        SELECT s.id, s.createdAt, s.totalAmount, s.discount, s.paymentMethod, s.amountPaid, s.change, c.name as client
        FROM sales s LEFT JOIN customers c ON c.id = s.customerId
        WHERE s.storeId = ? ORDER BY s.createdAt DESC LIMIT 5000`).all(storeId) as any[];
      return toCsv(
        ['id', 'date', 'montant_FCFA', 'remise_FCFA', 'paiement', 'montant_encaisse', 'monnaie', 'client'],
        rows.map((r) => [r.id, r.createdAt, r.totalAmount, r.discount, r.paymentMethod, r.amountPaid, r.change, r.client])
      );
    }
    case 'products': {
      const rows = db.prepare(`
        SELECT p.id, p.name, p.sku, p.barcode, p.price, p.costPrice, p.unit, p.isActive, p.isOnline, p.lowStockThreshold, p.stockMax, COALESCE(i.quantity,0) as stock
        FROM products p LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
        WHERE p.storeId = ? ORDER BY p.name LIMIT 5000`).all(storeId) as any[];
      return toCsv(
        ['id', 'nom', 'sku', 'code_barres', 'prix_FCFA', 'prix_achat_FCFA', 'unite', 'actif', 'en_ligne', 'seuil_alerte', 'stock_max', 'stock'],
        rows.map((r) => [r.id, r.name, r.sku, r.barcode, r.price, r.costPrice, r.unit, r.isActive ? 'oui' : 'non', r.isOnline ? 'oui' : 'non', r.lowStockThreshold, r.stockMax, r.stock])
      );
    }
    case 'stock': {
      const rows = db.prepare(`
        SELECT p.name, p.sku, COALESCE(i.quantity,0) as stock, p.lowStockThreshold, p.stockMax
        FROM products p LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
        WHERE p.storeId = ? AND p.isActive = 1 ORDER BY p.name LIMIT 5000`).all(storeId) as any[];
      return toCsv(['produit', 'sku', 'stock', 'seuil_alerte', 'stock_max'],
        rows.map((r) => [r.name, r.sku, r.stock, r.lowStockThreshold, r.stockMax]));
    }
    case 'orders': {
      const rows = db.prepare(`
        SELECT o.id, o.orderNumber, o.createdAt, o.status, o.totalAmount, o.discount, o.deliveryType, u.phone as client_phone
        FROM orders o LEFT JOIN users u ON u.id = o.clientId
        WHERE o.storeId = ? ORDER BY o.createdAt DESC LIMIT 5000`).all(storeId) as any[];
      return toCsv(['id', 'numero', 'date', 'statut', 'montant_FCFA', 'remise_FCFA', 'type', 'telephone_client'],
        rows.map((r) => [r.id, r.orderNumber, r.createdAt, r.status, r.totalAmount, r.discount, r.deliveryType, r.client_phone]));
    }
    case 'customers': {
      const rows = db.prepare(`
        SELECT c.id, c.name, c.phone, c.email, c.address,
          (SELECT COUNT(*) FROM sales s WHERE s.customerId = c.id) as nb_ventes,
          (SELECT COALESCE(SUM(s.totalAmount),0) FROM sales s WHERE s.customerId = c.id) as total_achats_FCFA,
          (SELECT COALESCE(SUM(d.balance),0) FROM debts d WHERE d.customerId = c.id AND d.isSettled = 0) as dette_FCFA
        FROM customers c WHERE c.storeId = ? ORDER BY c.name LIMIT 5000`).all(storeId) as any[];
      return toCsv(['id', 'nom', 'telephone', 'email', 'adresse', 'nb_ventes', 'total_achats_FCFA', 'dette_FCFA'],
        rows.map((r) => [r.id, r.name, r.phone, r.email, r.address, r.nb_ventes, r.total_achats_FCFA, r.dette_FCFA]));
    }
    case 'expenses': {
      const rows = db.prepare(`
        SELECT id, date, category, amount, description FROM expenses
        WHERE storeId = ? ORDER BY date DESC LIMIT 5000`).all(storeId) as any[];
      return toCsv(['id', 'date', 'categorie', 'montant_FCFA', 'description'],
        rows.map((r) => [r.id, r.date, r.category, r.amount, r.description]));
    }
    default:
      throw Object.assign(new Error('Type d export inconnu'), { status: 400 });
  }
}
