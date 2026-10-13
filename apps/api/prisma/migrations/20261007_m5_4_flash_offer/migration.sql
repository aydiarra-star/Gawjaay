-- Marketplace M5.4 — Offres Flash (prix réel, borné dans le temps, sur une variante réelle).
-- Migration ADDITIVE uniquement : aucune suppression, aucune réécriture destructive.
--
-- Dialecte : PostgreSQL (voir migration_lock.toml). Les colonnes de date utilisent
-- `TIMESTAMP(3)`, seul type date/heure accepté par PostgreSQL.
-- ⚠️ Cette migration a d'abord été écrite avec le type SQLite `DATETIME`, ce qui faisait
-- échouer `prisma migrate deploy` au démarrage du conteneur PostgreSQL :
--     ERROR: type "datetime" does not exist
-- Résultat : le service Render ne démarrait plus (tous les déploiements en échec) et
-- l'API restait figée sur une version antérieure. Ne jamais utiliser DATETIME ici.

-- CreateTable
CREATE TABLE "FlashOffer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "flashPrice" INTEGER NOT NULL,
    "quantityLimit" INTEGER,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlashOffer_organizationId_status_idx" ON "FlashOffer"("organizationId", "status");

-- CreateIndex
CREATE INDEX "FlashOffer_storeId_variantId_status_idx" ON "FlashOffer"("storeId", "variantId", "status");

-- CreateIndex
CREATE INDEX "FlashOffer_variantId_status_idx" ON "FlashOffer"("variantId", "status");

-- AlterTable : traçabilité d'une offre flash sur une ligne de commande.
ALTER TABLE "OrderItem" ADD COLUMN "flashOfferId" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_flashOfferId_idx" ON "OrderItem"("flashOfferId");

-- AddForeignKey
ALTER TABLE "FlashOffer" ADD CONSTRAINT "FlashOffer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashOffer" ADD CONSTRAINT "FlashOffer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashOffer" ADD CONSTRAINT "FlashOffer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_flashOfferId_fkey" FOREIGN KEY ("flashOfferId") REFERENCES "FlashOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
