import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';
import { LOT_C_MIGRATIONS } from './003_lot_c';
import { LOT_D_MIGRATIONS } from './004_lot_d';
import { LOT_E_MIGRATIONS } from './005_lot_e';
import { LOT_F_MIGRATIONS } from './006_lot_f';
import { LOT_G_MIGRATIONS } from './007_prod_indexes';
import { LOT_H_MIGRATIONS } from './008_idempotency';

/**
 * MIGRATION 009 — V3 : référentiel catégories + index de clés étrangères (audit V3 F1 / P2).
 *
 * 1. Catégories de base (cahier §8/§17) : insérées uniquement si le slug ET le nom sont absents
 *    (idempotent, compatible avec les bases où `alimentaire`/`boissons` existent déjà via seed.ts).
 *    Identifiants déterministes `cat_<slug>` : identiques sur SQLite et sur `deploy/postgres/009_*.sql`.
 * 2. Index sur des colonnes filtrées par TOUTES les listes du back-office et absentes du schéma V1
 *    (PostgreSQL n'indexe pas les clés étrangères automatiquement). Justification = plan d'exécution
 *    (EXPLAIN QUERY PLAN : SCAN → SEARCH sur chaque requête concernée), pas un benchmark inventé :
 *    - debts(customerId)            : GET /debts/customer/:id, solde client
 *    - customers(storeId)           : GET /customers/store/:id
 *    - expenses(storeId, date)      : GET /expenses/store/:id (fenêtre de dates)
 *    - sale_items(saleId)           : détail / analytics des ventes
 *    - order_items(orderId)         : détail commandes, listOrders (V3 sans N+1)
 *    - payments(orderId)            : paiement d'une commande (déjà UNIQUE → index implicite, on ne
 *                                     duplique pas) — RIEN à faire, listé pour traçabilité
 *    - employees(storeId)           : GET /employees/store/:id
 *    - products(storeId, isOnline)  : vitrine publique / marketplace (produits en ligne uniquement)
 *    - orders(storeId, status)      : back-office commandes filtrées par statut
 *    - audit_logs(createdAt)        : consultation admin paginée par date
 * Non destructif : CREATE INDEX IF NOT EXISTS + INSERT conditionnels uniquement.
 */
/** Instantané FIGÉ du référentiel au moment de la migration (une migration ne change jamais de sens). */
const V3_DEFAULT_CATEGORIES: ReadonlyArray<{ id: string; slug: string; name: string }> = [
  { id: 'cat_alimentaire', slug: 'alimentaire', name: 'Alimentaire' },
  { id: 'cat_boissons', slug: 'boissons', name: 'Boissons' },
  { id: 'cat_fruits_legumes', slug: 'fruits-legumes', name: 'Fruits & Légumes' },
  { id: 'cat_viande_poisson', slug: 'viande-poisson', name: 'Viande & Poisson' },
  { id: 'cat_boulangerie_patisserie', slug: 'boulangerie-patisserie', name: 'Boulangerie & Pâtisserie' },
  { id: 'cat_hygiene_beaute', slug: 'hygiene-beaute', name: 'Hygiène & Beauté' },
  { id: 'cat_sante_pharmacie', slug: 'sante-pharmacie', name: 'Santé & Parapharmacie' },
  { id: 'cat_menage_entretien', slug: 'menage-entretien', name: 'Ménage & Entretien' },
  { id: 'cat_bebe_enfants', slug: 'bebe-enfants', name: 'Bébé & Enfants' },
  { id: 'cat_mode_vetements', slug: 'mode-vetements', name: 'Mode & Vêtements' },
  { id: 'cat_electronique_telephonie', slug: 'electronique-telephonie', name: 'Électronique & Téléphonie' },
  { id: 'cat_maison_decoration', slug: 'maison-decoration', name: 'Maison & Décoration' },
  { id: 'cat_quincaillerie_bricolage', slug: 'quincaillerie-bricolage', name: 'Quincaillerie & Bricolage' },
  { id: 'cat_papeterie_librairie', slug: 'papeterie-librairie', name: 'Papeterie & Librairie' },
  { id: 'cat_autres', slug: 'autres', name: 'Autres' },
];

const migration: Migration = {
  name: '009_v3_categories_indexes',
  up: (db: any) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customerId);
      CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(storeId);
      CREATE INDEX IF NOT EXISTS idx_expenses_store_date ON expenses(storeId, date);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(saleId);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(orderId);
      CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(storeId);
      CREATE INDEX IF NOT EXISTS idx_products_store_online ON products(storeId, isOnline, isActive);
      CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(storeId, status);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(createdAt);
    `);
    const now = new Date().toISOString();
    for (const c of V3_DEFAULT_CATEGORIES) {
      const exists = db.prepare('SELECT id FROM categories WHERE slug = ? OR name = ? OR id = ?').get(c.slug, c.name, c.id);
      if (exists) continue;
      db.prepare('INSERT INTO categories (id, name, slug, parentId, createdAt) VALUES (?,?,?,NULL,?)')
        .run(c.id, c.name, c.slug, now);
    }
  },
};

export const LOT_I_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [
    ...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS, ...LOT_D_MIGRATIONS, ...LOT_E_MIGRATIONS,
    ...LOT_F_MIGRATIONS, ...LOT_G_MIGRATIONS, ...LOT_H_MIGRATIONS, ...LOT_I_MIGRATIONS,
  ]);
}
