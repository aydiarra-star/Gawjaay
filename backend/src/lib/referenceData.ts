import db from './db';
import { seedRegions, SENEGAL_REGIONS } from '../modules/regions/service';

/**
 * Données de référence indispensables au produit (cahier §4/§17 : 14 régions → départements → communes du Sénégal).
 * Insérées au démarrage du serveur si la table est vide (idempotent, jamais de doublon, aucune donnée métier créée).
 * Les catégories sont, elles, gérées par la migration 009.
 */
export async function ensureReferenceData(log: (msg: string) => void = console.log) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM regions').get() as any;
  if (Number(row?.n || 0) > 0) return { seeded: false, regions: Number(row.n) };
  await seedRegions();
  const after = db.prepare('SELECT COUNT(*) AS n FROM regions').get() as any;
  log(`[référentiel] ${after.n}/${SENEGAL_REGIONS.length} régions du Sénégal insérées (départements + communes)`);
  return { seeded: true, regions: Number(after.n) };
}
