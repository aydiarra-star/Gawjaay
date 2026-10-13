-- Marketplace M5.4.1 — Intégrité commerciale des ventes liées à une offre flash.
-- Migration ADDITIVE uniquement : aucune suppression, aucune réécriture destructive.
--
-- Dialecte : PostgreSQL (voir migration_lock.toml). Types utilisés : TEXT uniquement.
-- Cette migration référence la table "FlashOffer" créée par 20261007_m5_4_flash_offer.

-- AlterTable : traçabilité d'une offre flash sur une ligne de vente.
ALTER TABLE "SaleItem" ADD COLUMN "flashOfferId" TEXT;

-- CreateIndex
CREATE INDEX "SaleItem_flashOfferId_idx" ON "SaleItem"("flashOfferId");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_flashOfferId_fkey" FOREIGN KEY ("flashOfferId") REFERENCES "FlashOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
