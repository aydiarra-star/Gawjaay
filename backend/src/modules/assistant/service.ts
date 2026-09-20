import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';
import { storeAnalytics } from '../analytics/service';

/**
 * LOT F — Assistant IA « strict no-invention ».
 *
 * JAMAIS de LLM générateur branché en direct : moteur d'intentions déterministe qui
 * interroge les données réelles de la boutique (analytics LOT B, inventaires, commandes,
 * livraisons, fidélité). Toute réponse embarque les chiffres calculés du moment.
 * Si la donnée n'existe pas → « Je ne dispose pas de cette information » (+ pourquoi).
 *
 * Actions sensibles = ai_action_requests en deux temps (demande → confirmation explicite
 * → exécution whitelistée + audit). Aucune écriture de prix/stock/paiement n'est jamais
 * déclenchée par l'assistant : le réapprovisionnement reste une SUGGESTION validée par
 * le commerçant (LOT D), l'alerte stock est une notification.
 */

function nowIso() { return new Date().toISOString(); }
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); }

const NO_INFO = "Je ne dispose pas de cette information.";

export const CAPABILITIES = [
  "Ventes (aujourd'hui, 7 et 30 derniers jours)",
  "Stock (produits sous le seuil, dormance)",
  "Top produits (chiffre d'affaires, quantités)",
  "Clients (actifs, nouveaux, panier moyen)",
  "Dépenses et marge estimée (pas un bénéfice comptable)",
  "Commandes en ligne et livraisons",
  "Fidélité (comptes et points)",
  "Actions : plan de réapprovisionnement, alerte stock (avec votre confirmation)",
];

// ---------- Intentions ----------

export type Intent = 'SALES' | 'STOCK' | 'TOP_PRODUCTS' | 'CLIENTS' | 'FINANCE' | 'ORDERS' | 'DELIVERIES' | 'LOYALTY' | 'FIDELITE' | 'PROMOS' | 'HELP' | 'UNKNOWN';

const PATTERNS: [Intent, RegExp][] = [
  ['FIDELITE', /fidélité|fidelite|points (de )?fidélité|\bpoints\b/i],
  ['DELIVERIES', /livraison|livreur|course|colis/i],
  ['PROMOS', /promo|promotion|coupon|réduction|reduction/i],
  ['FINANCE', /dépense|depense|marge|finance|profit|bénéfice|benefice/i],
  ['TOP_PRODUCTS', /top|meilleur|best|produit le plus/i],
  ['CLIENTS', /client/i],
  ['ORDERS', /commande/i],
  ['STOCK', /stock|rupture|seuil|inventaire|réappro|reappro|manque/i],
  ['SALES', /vente|chiffre|affaires|\bca\b|revenu|recette|vendu/i],
  ['HELP', /aide|help|que peux[- ]tu|comment ça marche/i],
];

export function detectIntent(question: string): Intent {
  for (const [intent, re] of PATTERNS) if (re.test(question)) return intent;
  return 'UNKNOWN';
}

// ---------- Réponses calculées depuis les données réelles ----------

function fmt(n: number) { return `${Math.round(n).toLocaleString('fr-FR')} FCFA`; }

async function answerSales(user: any, storeId: string, question: string) {
  const a = await storeAnalytics(user, storeId);
  const s = a.sales;
  const lower = question.toLowerCase();
  let content: string;
  if (/aujourd'hui|aujourdhui|jour\b|ce jour/.test(lower)) {
    content = s.today.count > 0
      ? `Aujourd'hui : ${s.today.count} vente(s) pour un total de ${fmt(s.today.total)}.`
      : `${NO_INFO} Aucune vente n'est enregistrée aujourd'hui pour cette boutique.`;
  } else {
    content = [
      `Chiffre d'affaires réel (ventes encaissées) :`,
      `• Aujourd'hui : ${s.today.count} vente(s) — ${fmt(s.today.total)}`,
      `• 7 derniers jours : ${fmt(s.last7days.total)}`,
      `• 30 derniers jours : ${fmt(s.last30days.total)}`,
    ].join('\n');
    if (s.last30days.total === 0) content = `${NO_INFO} Aucune vente enregistrée sur les 30 derniers jours pour cette boutique.`;
  }
  return { content, intent: 'SALES' as const, data: { sales: { today: s.today, last7days: s.last7days, last30days: s.last30days } }, sources: ['sales (temps réel)'] };
}

async function answerStock(user: any, storeId: string) {
  const a = await storeAnalytics(user, storeId);
  const under = a.stock.underThreshold as any[];
  const dormant = a.stock.dormant as any[];
  if (under.length === 0) {
    return { content: `${NO_INFO} Aucun produit sous le seuil : tous les stocks sont au-dessus des seuils définis.`, intent: 'STOCK' as const, data: { underThreshold: [], dormant: dormant.length }, sources: ['products + inventories'] };
  }
  const lines = under.slice(0, 10).map((p: any) => `• ${p.name} : ${p.stock} en stock (seuil ${p.lowStockThreshold ?? 5})`);
  const content = [
    `${under.length} produit(s) sous le seuil :`,
    ...lines,
    dormant.length ? `⚠️ ${dormant.length} produit(s) en dormance (aucune sortie depuis 30+ jours).` : '',
    "Astuce : demandez-moi un « plan de réapprovisionnement » — je le prépare et vous confirmez.",
  ].filter(Boolean).join('\n');
  return { content, intent: 'STOCK' as const, data: { underThreshold: under.slice(0, 10), dormantCount: dormant.length }, sources: ['products + inventories + inventory_movements'] };
}

async function answerTop(user: any, storeId: string) {
  const a = await storeAnalytics(user, storeId);
  const top = a.products.topRevenue as any[];
  if (!top.length) return { content: `${NO_INFO} Aucune vente sur la période (30 derniers jours) : impossible d'établir un top produits.`, intent: 'TOP_PRODUCTS' as const, data: { top: [] }, sources: ['sale_items'] };
  const lines = top.slice(0, 5).map((p: any, i: number) => `${i + 1}. ${p.name} — ${fmt(p.revenue)} (${p.qtySold} vendu(s))`);
  return { content: `Top 5 produits par chiffre d'affaires (30 derniers jours) :\n${lines.join('\n')}`, intent: 'TOP_PRODUCTS' as const, data: { top: top.slice(0, 5) }, sources: ['sale_items + sales (30 j)'] };
}

async function answerClients(user: any, storeId: string) {
  const a = await storeAnalytics(user, storeId);
  const c = a.clients;
  if (c.activeCount === 0) return { content: `${NO_INFO} Aucun client actif (avec vente) sur les 30 derniers jours.`, intent: 'CLIENTS' as const, data: c, sources: ['customers + sales'] };
  const content = [
    `Clients (30 derniers jours) :`,
    `• ${c.activeCount} client(s) actif(s) — dont ${c.newCount} nouveau(x), ${c.recurringCount} récurrent(s)`,
    `• Panier moyen : ${fmt(c.averageBasket)}`,
    c.top[0] ? `• Meilleur client : ${c.top[0].name} (${fmt(c.top[0].totalSpent)})` : '',
  ].filter(Boolean).join('\n');
  return { content, intent: 'CLIENTS' as const, data: { activeCount: c.activeCount, newCount: c.newCount, recurringCount: c.recurringCount, averageBasket: c.averageBasket }, sources: ['customers + sales (30 j)'] };
}

async function answerFinance(user: any, storeId: string) {
  const a = await storeAnalytics(user, storeId);
  const f = a.finance;
  const content = [
    `Sur 30 jours :`,
    `• Revenus (ventes réelles) : ${fmt(f.revenue)}`,
    `• Dépenses saisies : ${fmt(f.expenses)}`,
    f.margeEstimee == null
      ? `• Marge estimée : ${NO_INFO} Aucun prix d'achat renseigné — je ne l'invente pas.`
      : `• Marge estimée : ${fmt(f.margeEstimee)} (couverture ${f.margeCoverage}%)`,
    f.note,
  ].join('\n');
  return { content, intent: 'FINANCE' as const, data: f, sources: ['sales + expenses + products.costPrice'] };
}

async function answerOrders(user: any, storeId: string) {
  const rows = db.prepare(`SELECT status, COUNT(*) as c, COALESCE(SUM(totalAmount),0) as total FROM orders WHERE storeId = ? GROUP BY status`).all(storeId) as any[];
  if (!rows.length) return { content: `${NO_INFO} Aucune commande en ligne enregistrée pour cette boutique.`, intent: 'ORDERS' as const, data: { byStatus: [] }, sources: ['orders'] };
  const byStatus = rows.map((r: any) => `${r.status}: ${r.c} (${fmt(r.total)})`);
  return { content: `Commandes en ligne par statut :\n${byStatus.map((x: string) => `• ${x}`).join('\n')}`, intent: 'ORDERS' as const, data: { byStatus: rows }, sources: ['orders'] };
}

async function answerDeliveries(user: any, storeId: string) {
  const rows = db.prepare(`SELECT status, COUNT(*) as c FROM deliveries WHERE storeId = ? GROUP BY status`).all(storeId) as any[];
  if (!rows.length) return { content: `${NO_INFO} Aucune livraison enregistrée pour cette boutique.`, intent: 'DELIVERIES' as const, data: { byStatus: [] }, sources: ['deliveries'] };
  const byStatus = rows.map((r: any) => `• ${r.status}: ${r.c}`);
  return { content: `Livraisons par statut :\n${byStatus.join('\n')}`, intent: 'DELIVERIES' as const, data: { byStatus: rows }, sources: ['deliveries'] };
}

async function answerLoyalty(user: any, storeId: string) {
  const store = db.prepare('SELECT loyaltyEnabled, loyaltyEarnRate, loyaltyRedeemValue FROM stores WHERE id = ?').get(storeId) as any;
  const rows = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(points),0) as total FROM loyalty_accounts WHERE storeId = ?`).get(storeId) as any;
  if (!store?.loyaltyEnabled && rows.c === 0) {
    return { content: `${NO_INFO} Le programme de fidélité n'est pas activé pour cette boutique (activez-le dans Fidélité).`, intent: 'LOYALTY' as const, data: { enabled: !!store?.loyaltyEnabled, accounts: 0 }, sources: ['stores + loyalty_accounts'] };
  }
  const content = store?.loyaltyEnabled
    ? `Fidélité : programme ACTIF (${store.loyaltyEarnRate} pts / 1000 FCFA, 1 pt = ${store.loyaltyRedeemValue} FCFA). ${rows.c} compte(s) client(s), ${rows.total} points cumulés.`
    : `Programme inactif mais ${rows.c} compte(s) existent encore (${rows.total} points cumulés).`;
  return { content, intent: 'LOYALTY' as const, data: { enabled: !!store.loyaltyEnabled, accounts: rows.c, totalPoints: rows.total }, sources: ['stores + loyalty_accounts'] };
}

function answerPromos(user: any, storeId: string) {
  const rows = db.prepare(`SELECT name, type, status, startDate, endDate FROM promotions WHERE storeId = ? ORDER BY createdAt DESC LIMIT 10`).all(storeId) as any[];
  if (!rows.length) return { content: `${NO_INFO} Aucune promotion enregistrée pour cette boutique.`, intent: 'PROMOS' as const, data: { promotions: [] }, sources: ['promotions'] };
  const lines = rows.map((p: any) => `• ${p.name} (${p.type}) — ${p.status}, du ${p.startDate?.slice(0, 10)} au ${p.endDate?.slice(0, 10)}`);
  return { content: `Promotions récentes :\n${lines.join('\n')}`, intent: 'PROMOS' as const, data: { promotions: rows }, sources: ['promotions'] };
}

function answerHelp() {
  return {
    content: `Je suis l'assistant GawJaay. Je réponds UNIQUEMENT à partir des données réelles de votre boutique — je n'invente jamais un chiffre.\nJe peux répondre sur :\n${CAPABILITIES.map((c) => `• ${c}`).join('\n')}`,
    intent: 'HELP' as const, data: { capabilities: CAPABILITIES }, sources: [],
  };
}

function answerUnknown() {
  return {
    content: `${NO_INFO} Je ne réponds qu'à partir des données réelles de votre boutique, et cette question sort de mon périmètre.\nSujets possibles :\n${CAPABILITIES.map((c) => `• ${c}`).join('\n')}`,
    intent: 'UNKNOWN' as const, data: { capabilities: CAPABILITIES }, sources: [],
  };
}

// ---------- Conversation ----------

function getOrCreateConversation(userId: string, storeId: string) {
  let conv = db.prepare('SELECT * FROM ai_conversations WHERE userId = ? AND storeId = ? ORDER BY updatedAt DESC LIMIT 1').get(userId, storeId) as any;
  if (!conv) {
    const id = cuid();
    db.prepare('INSERT INTO ai_conversations (id, userId, storeId, createdAt, updatedAt) VALUES (?,?,?,?,?)').run(id, userId, storeId, nowIso(), nowIso());
    conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id);
  }
  return conv;
}

export async function ask(user: any, storeId: string, question: string) {
  assertStoreAccess(storeId, user);
  const q = (question || '').trim();
  if (!q) throw Object.assign(new Error('Question vide'), { status: 400 });
  if (q.length > 1000) throw Object.assign(new Error('Question trop longue (max 1000 caractères)'), { status: 400 });

  const conv = getOrCreateConversation(user.userId, storeId);
  db.prepare('INSERT INTO ai_messages (id, conversationId, role, content, intent, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), conv.id, 'USER', q, null, nowIso());

  const lower = q.toLowerCase();
  let answer: { content: string; intent: Intent; data: any; sources: string[] };
  if (/(stock|rupture|seuil|inventaire)/.test(lower)) answer = await answerStock(user, storeId);
  else switch (detectIntent(q)) {
    case 'SALES': answer = await answerSales(user, storeId, q); break;
    case 'TOP_PRODUCTS': answer = await answerTop(user, storeId); break;
    case 'CLIENTS': answer = await answerClients(user, storeId); break;
    case 'FINANCE': answer = await answerFinance(user, storeId); break;
    case 'ORDERS': answer = await answerOrders(user, storeId); break;
    case 'DELIVERIES': answer = await answerDeliveries(user, storeId); break;
    case 'LOYALTY':
    case 'FIDELITE': answer = await answerLoyalty(user, storeId); break;
    case 'PROMOS': answer = answerPromos(user, storeId); break;
    case 'HELP': answer = answerHelp(); break;
    default: answer = answerUnknown();
  }

  db.prepare('INSERT INTO ai_messages (id, conversationId, role, content, intent, dataJson, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), conv.id, 'ASSISTANT', answer.content, answer.intent, JSON.stringify(answer.data), nowIso());
  db.prepare('UPDATE ai_conversations SET updatedAt = ? WHERE id = ?').run(nowIso(), conv.id);

  return {
    conversationId: conv.id,
    intent: answer.intent,
    content: answer.content,
    data: answer.data,
    sources: answer.sources,
    disclaimer: 'Réponse calculée à partir des données réelles de la boutique (aucune estimation inventée).',
  };
}

export function history(user: any, storeId: string, limit = 50) {
  assertStoreAccess(storeId, user);
  const conv = db.prepare('SELECT * FROM ai_conversations WHERE userId = ? AND storeId = ? ORDER BY updatedAt DESC LIMIT 1').get(user.userId, storeId) as any;
  if (!conv) return [];
  return db.prepare('SELECT id, role, content, intent, dataJson, createdAt FROM ai_messages WHERE conversationId = ? ORDER BY createdAt LIMIT ?')
    .all(conv.id, Math.min(limit, 100))
    .map((m: any) => ({ ...m, data: m.dataJson ? JSON.parse(m.dataJson) : null, dataJson: undefined }));
}

// ---------- Actions contrôlées (whitelist + confirmation explicite) ----------

const ACTION_TTL_MS = 15 * 60 * 1000;

export const WHITELISTED_ACTIONS = ['GENERATE_REPLENISHMENT_PLAN', 'SEND_LOW_STOCK_ALERT'] as const;
export type ActionType = typeof WHITELISTED_ACTIONS[number];

function lowStockRows(storeId: string) {
  return db.prepare(`
    SELECT p.id as productId, p.name, COALESCE(i.quantity,0) as stock, p.lowStockThreshold as threshold, p.stockMax
    FROM products p LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    WHERE p.storeId = ? AND p.isActive = 1 AND COALESCE(i.quantity,0) <= p.lowStockThreshold
    ORDER BY (COALESCE(i.quantity,0) / MAX(p.lowStockThreshold,1)) ASC`).all(storeId) as any[];
}

function executeAction(actionType: string, storeId: string, userId: string) {
  if (actionType === 'GENERATE_REPLENISHMENT_PLAN') {
    const rows = lowStockRows(storeId);
    let created = 0;
    const merchant = db.prepare('SELECT merchantId FROM stores WHERE id = ?').get(storeId) as any;
    for (const r of rows) {
      const open = db.prepare(`SELECT id FROM replenishment_suggestions WHERE storeId = ? AND productId = ? AND status = 'OPEN'`).get(storeId, r.productId);
      if (open) continue;
      const target = r.stockMax ?? Math.max((r.threshold || 5) * 4, 10);
      const suggestedQty = Math.max(target - r.stock, 1);
      db.prepare(`INSERT INTO replenishment_suggestions (id, storeId, merchantId, productId, currentStock, threshold, suggestedQty, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(cuid(), storeId, merchant?.merchantId || '', r.productId, r.stock, r.threshold ?? 5, suggestedQty, 'OPEN', nowIso());
      created++;
    }
    return { action: actionType, productsBelowThreshold: rows.length, suggestionsCreated: created, note: 'Suggestions enregistrées — à valider dans Réapprovisionnement (les quantités restent sous votre contrôle).' };
  }
  if (actionType === 'SEND_LOW_STOCK_ALERT') {
    const rows = lowStockRows(storeId);
    if (!rows.length) return { action: actionType, notified: false, note: 'Aucun produit sous le seuil — rien à signaler.' };
    const lines = rows.slice(0, 10).map((r: any) => `• ${r.name} : ${r.stock} (seuil ${r.threshold ?? 5})`);
    db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), userId, 'Alerte stock (assistant)', `${rows.length} produit(s) sous le seuil :\n${lines.join('\n')}`, 'STOCK_ALERT', JSON.stringify({ storeId, via: 'assistant' }), nowIso());
    return { action: actionType, notified: true, productsBelowThreshold: rows.length };
  }
  throw Object.assign(new Error('Action non autorisée'), { status: 400 });
}

export function requestAction(user: any, storeId: string, actionType: string, params: any = {}) {
  assertStoreAccess(storeId, user);
  if (!(WHITELISTED_ACTIONS as readonly string[]).includes(actionType)) {
    throw Object.assign(new Error(`Action non autorisée. Actions disponibles : ${WHITELISTED_ACTIONS.join(', ')}`), { status: 400 });
  }
  const id = cuid();
  db.prepare(`INSERT INTO ai_action_requests (id, storeId, userId, actionType, paramsJson, status, expiresAt, createdAt) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, storeId, user.userId, actionType, JSON.stringify(params || {}), 'PENDING', new Date(Date.now() + ACTION_TTL_MS).toISOString(), nowIso());
  return db.prepare('SELECT id, storeId, userId, actionType, status, paramsJson, expiresAt, createdAt FROM ai_action_requests WHERE id = ?').get(id);
}

export async function confirmAction(user: any, requestId: string, confirmed: boolean) {
  let req = db.prepare('SELECT * FROM ai_action_requests WHERE id = ?').get(requestId) as any;
  if (!req) throw Object.assign(new Error('Demande introuvable'), { status: 404 });
  assertStoreAccess(req.storeId, user);
  // expiration paresseuse des demandes PENDING dépassées
  db.prepare(`UPDATE ai_action_requests SET status = 'EXPIRED' WHERE status = 'PENDING' AND expiresAt < ?`).run(nowIso());
  req = db.prepare('SELECT * FROM ai_action_requests WHERE id = ?').get(requestId) as any;
  if (req.status !== 'PENDING') throw Object.assign(new Error(`Demande déjà traitée (${req.status})`), { status: 400 });

  if (!confirmed) {
    db.prepare(`UPDATE ai_action_requests SET status = 'REJECTED', executedAt = ? WHERE id = ?`).run(nowIso(), requestId);
    return db.prepare('SELECT id, storeId, actionType, status FROM ai_action_requests WHERE id = ?').get(requestId);
  }

  db.prepare(`UPDATE ai_action_requests SET status = 'CONFIRMED', confirmedAt = ? WHERE id = ?`).run(nowIso(), requestId);
  try {
    const result = executeAction(req.actionType, req.storeId, req.userId);
    db.prepare(`UPDATE ai_action_requests SET status = 'EXECUTED', resultJson = ?, executedAt = ? WHERE id = ?`).run(JSON.stringify(result), nowIso(), requestId);
    db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), user.userId, 'AI_ACTION', 'AIActionRequest', requestId, JSON.stringify({ actionType: req.actionType, storeId: req.storeId, result }), nowIso());
    return { ...db.prepare('SELECT id, storeId, actionType, status, resultJson, executedAt FROM ai_action_requests WHERE id = ?').get(requestId) as any, result };
  } catch (e: any) {
    db.prepare(`UPDATE ai_action_requests SET status = 'FAILED', resultJson = ?, executedAt = ? WHERE id = ?`).run(JSON.stringify({ error: e.message }), nowIso(), requestId);
    throw e;
  }
}

export function listActions(user: any, storeId: string) {
  assertStoreAccess(storeId, user);
  return db.prepare('SELECT id, storeId, userId, actionType, status, paramsJson, resultJson, expiresAt, confirmedAt, executedAt, createdAt FROM ai_action_requests WHERE storeId = ? ORDER BY createdAt DESC LIMIT 30').all(storeId) as any[];
}
