-- Marketplace M3 — découverte publique (recherche / filtres / proximité).
-- Migration ADDITIVE uniquement : aucune suppression, aucune réinitialisation,
-- aucune réécriture destructive. Les données existantes restent intactes.

-- AlterTable : nom normalisé (minuscules, sans accents) pour la recherche.
-- Nullable : les lignes existantes sont conservées telles quelles ; la recherche
-- retombe sur `name` tant que la valeur n'a pas été recalculée à l'écriture.
ALTER TABLE "Product" ADD COLUMN "searchName" TEXT;

-- CreateIndex : filtre principal de la découverte publique.
CREATE INDEX "Product_marketplaceVisible_isActive_idx" ON "Product"("marketplaceVisible", "isActive");

-- CreateIndex : recherche normalisée.
CREATE INDEX "Product_searchName_idx" ON "Product"("searchName");

-- CreateIndex : disponibilité réelle d'une variante.
CREATE INDEX "Inventory_variantId_quantity_idx" ON "Inventory"("variantId", "quantity");

-- CreateIndex : boutiques publiques actives.
CREATE INDEX "Store_isPublic_isActive_idx" ON "Store"("isPublic", "isActive");

-- CreateIndex : localisation des boutiques.
CREATE INDEX "Store_region_city_idx" ON "Store"("region", "city");

-- CreateIndex : annonces actives par localisation.
CREATE INDEX "Listing_status_region_city_idx" ON "Listing"("status", "region", "city");

-- CreateIndex : annonces actives par mode de remise.
CREATE INDEX "Listing_status_fulfillment_idx" ON "Listing"("status", "fulfillment");

-- AddForeignKey : relation réelle Listing → Store (proximité + cohérence métier).
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
