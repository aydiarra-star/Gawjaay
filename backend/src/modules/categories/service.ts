import db, { cuid } from '../../lib/db';
import { slugify } from '../../utils/slug';
import { recordAudit } from '../../lib/audit';
import { withTransaction } from '../../lib/transaction';

/**
 * Catégories produit (cahier §8, §17, §31) — référentiel PLATEFORME géré par l'ADMIN.
 *
 * - Lecture publique (marketplace, vitrine, formulaires marchands) avec le nombre de produits
 *   réellement en ligne par catégorie (jamais de compteur inventé).
 * - Écriture réservée à l'ADMIN (création, renommage, rattachement à un parent, suppression).
 * - Une catégorie référencée par au moins un produit ne peut pas être supprimée (409) : le
 *   marchand doit d'abord reclasser ses produits (aucune perte silencieuse de données).
 * - Le référentiel de base (migration 009) est seedé de façon idempotente ; les identifiants sont
 *   déterministes (`cat_<slug>`) pour être identiques sur SQLite et sur le chemin PostgreSQL.
 */

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  createdAt: string;
}

/** Référentiel de base — libellés génériques du commerce de proximité (aucune donnée métier). */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: 'alimentaire', name: 'Alimentaire' },
  { slug: 'boissons', name: 'Boissons' },
  { slug: 'fruits-legumes', name: 'Fruits & Légumes' },
  { slug: 'viande-poisson', name: 'Viande & Poisson' },
  { slug: 'boulangerie-patisserie', name: 'Boulangerie & Pâtisserie' },
  { slug: 'hygiene-beaute', name: 'Hygiène & Beauté' },
  { slug: 'sante-pharmacie', name: 'Santé & Parapharmacie' },
  { slug: 'menage-entretien', name: 'Ménage & Entretien' },
  { slug: 'bebe-enfants', name: 'Bébé & Enfants' },
  { slug: 'mode-vetements', name: 'Mode & Vêtements' },
  { slug: 'electronique-telephonie', name: 'Électronique & Téléphonie' },
  { slug: 'maison-decoration', name: 'Maison & Décoration' },
  { slug: 'quincaillerie-bricolage', name: 'Quincaillerie & Bricolage' },
  { slug: 'papeterie-librairie', name: 'Papeterie & Librairie' },
  { slug: 'autres', name: 'Autres' },
];

export function defaultCategoryId(slug: string) {
  return `cat_${slug.replace(/-/g, '_')}`;
}

/** Insère les catégories de base manquantes (idempotent, par slug). Retourne le nombre inséré. */
export function seedDefaultCategories(database: any = db): number {
  let inserted = 0;
  const now = new Date().toISOString();
  for (const c of DEFAULT_CATEGORIES) {
    const exists = database.prepare('SELECT id FROM categories WHERE slug = ? OR name = ?').get(c.slug, c.name);
    if (exists) continue;
    database.prepare('INSERT INTO categories (id, name, slug, parentId, createdAt) VALUES (?,?,?,NULL,?)')
      .run(defaultCategoryId(c.slug), c.name, c.slug, now);
    inserted++;
  }
  return inserted;
}

function notFound(): never {
  throw Object.assign(new Error('Catégorie introuvable'), { status: 404 });
}

/** Liste publique, triée par nom, avec le nombre de produits EN LIGNE (isOnline=1 AND isActive=1). */
export async function listCategories(opts: { withCounts?: boolean } = {}) {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all() as CategoryRow[];
  if (!opts.withCounts) return rows;
  const counts = db.prepare(`SELECT p.categoryId AS categoryId, COUNT(*) AS cnt
      FROM products p JOIN stores s ON s.id = p.storeId
      WHERE p.categoryId IS NOT NULL AND p.isActive = 1 AND p.isOnline = 1 AND s.isActive = 1
      GROUP BY p.categoryId`).all() as Array<{ categoryId: string; cnt: number }>;
  const byId = new Map(counts.map((c) => [c.categoryId, Number(c.cnt)]));
  return rows.map((r) => ({ ...r, productCount: byId.get(r.id) || 0 }));
}

export async function getCategory(idOrSlug: string) {
  const row = db.prepare('SELECT * FROM categories WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug) as CategoryRow | undefined;
  if (!row) notFound();
  const children = db.prepare('SELECT * FROM categories WHERE parentId = ? ORDER BY name ASC').all(row!.id);
  const productCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM products p JOIN stores s ON s.id = p.storeId
      WHERE p.categoryId = ? AND p.isActive = 1 AND p.isOnline = 1 AND s.isActive = 1`).get(row!.id) as any).cnt;
  return { ...row!, children, productCount: Number(productCount || 0) };
}

function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base) || 'categorie';
  let slug = root;
  let i = 2;
  while (true) {
    const clash = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) as any;
    if (!clash || clash.id === excludeId) return slug;
    slug = `${root}-${i++}`;
  }
}

function assertParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return null;
  if (selfId && parentId === selfId) throw Object.assign(new Error('Une catégorie ne peut pas être son propre parent'), { status: 400 });
  const parent = db.prepare('SELECT id, parentId FROM categories WHERE id = ?').get(parentId) as any;
  if (!parent) throw Object.assign(new Error('Catégorie parente introuvable'), { status: 400 });
  if (parent.parentId) throw Object.assign(new Error('Un seul niveau de sous-catégorie est autorisé'), { status: 400 });
  return parentId;
}

export async function createCategory(adminUserId: string, data: { name: string; parentId?: string | null }) {
  const name = data.name.trim();
  const clash = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (clash) throw Object.assign(new Error('Une catégorie porte déjà ce nom'), { status: 409 });
  const parentId = assertParent(data.parentId);
  const id = cuid();
  const slug = uniqueSlug(name);
  return withTransaction(() => {
    db.prepare('INSERT INTO categories (id, name, slug, parentId, createdAt) VALUES (?,?,?,?,?)')
      .run(id, name, slug, parentId, new Date().toISOString());
    recordAudit(adminUserId, 'CATEGORY_CREATE', 'category', id, { name, slug, parentId });
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow;
  });
}

export async function updateCategory(adminUserId: string, id: string, data: { name?: string; parentId?: string | null }) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
  if (!existing) notFound();
  const name = data.name !== undefined ? data.name.trim() : existing!.name;
  if (name !== existing!.name) {
    const clash = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, id);
    if (clash) throw Object.assign(new Error('Une catégorie porte déjà ce nom'), { status: 409 });
  }
  const parentId = data.parentId !== undefined ? assertParent(data.parentId, id) : existing!.parentId;
  if (parentId) {
    const hasChildren = db.prepare('SELECT 1 FROM categories WHERE parentId = ? LIMIT 1').get(id);
    if (hasChildren) throw Object.assign(new Error('Une catégorie ayant des sous-catégories ne peut pas devenir une sous-catégorie'), { status: 400 });
  }
  const slug = name !== existing!.name ? uniqueSlug(name, id) : existing!.slug;
  return withTransaction(() => {
    db.prepare('UPDATE categories SET name = ?, slug = ?, parentId = ? WHERE id = ?').run(name, slug, parentId, id);
    recordAudit(adminUserId, 'CATEGORY_UPDATE', 'category', id, { name, slug, parentId });
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow;
  });
}

export async function deleteCategory(adminUserId: string, id: string) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
  if (!existing) notFound();
  const used = (db.prepare('SELECT COUNT(*) AS cnt FROM products WHERE categoryId = ?').get(id) as any).cnt;
  if (Number(used) > 0) {
    throw Object.assign(new Error(`Catégorie utilisée par ${used} produit(s) : reclassez-les avant suppression`), { status: 409, details: { productCount: Number(used) } });
  }
  const children = (db.prepare('SELECT COUNT(*) AS cnt FROM categories WHERE parentId = ?').get(id) as any).cnt;
  if (Number(children) > 0) throw Object.assign(new Error('Supprimez ou déplacez d abord les sous-catégories'), { status: 409 });
  return withTransaction(() => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    recordAudit(adminUserId, 'CATEGORY_DELETE', 'category', id, { name: existing!.name, slug: existing!.slug });
    return { deleted: true, id };
  });
}
