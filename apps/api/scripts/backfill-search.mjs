#!/usr/bin/env node
/**
 * Recalcule `Product.searchName` (nom normalisé pour la recherche) pour les
 * produits créés AVANT M3, afin que la recherche insensible à la casse/accents
 * couvre aussi les données existantes.
 *
 * Idempotent et NON destructif : n'écrit que les lignes dont la valeur diffère.
 * Sûr à exécuter à chaque démarrage (aucune donnée métier n'est modifiée).
 */
import { PrismaClient } from '@prisma/client';
import { buildProductSearchText } from '@gawjaay/shared';

const prisma = new PrismaClient();
let updated = 0;

try {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, description: true, format: true, searchName: true },
  });
  for (const product of products) {
    const searchName = buildProductSearchText([product.name, product.description, product.format]);
    if (product.searchName === searchName) continue;
    await prisma.product.update({ where: { id: product.id }, data: { searchName } });
    updated += 1;
  }
  console.log(`[backfill-search] searchName à jour : ${updated} produit(s) sur ${products.length}.`);
} finally {
  await prisma.$disconnect();
}
