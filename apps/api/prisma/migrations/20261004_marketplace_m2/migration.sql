-- Marketplace M2 — fondation vendeurs + annonces + coffre-fort de confiance.
-- Migration ADDITIVE uniquement : aucune suppression, aucune réécriture de données.
-- (PriceHistory.newValue devient nullable pour permettre la suppression d'un prix,
--  ex. retrait d'un prix promotionnel — les lignes existantes restent intactes.)

-- AlterTable
ALTER TABLE "PriceHistory" ALTER COLUMN "newValue" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sellerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "phone" TEXT,
    "organizationId" TEXT,
    "city" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "storeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "condition" TEXT,
    "price" INTEGER,
    "quantity" INTEGER,
    "city" TEXT,
    "region" TEXT,
    "fulfillment" TEXT NOT NULL DEFAULT 'PICKUP',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_marketplaceVisible_idx" ON "Product"("marketplaceVisible");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- CreateIndex
CREATE INDEX "SellerProfile_userId_idx" ON "SellerProfile"("userId");

-- CreateIndex
CREATE INDEX "SellerProfile_organizationId_idx" ON "SellerProfile"("organizationId");

-- CreateIndex
CREATE INDEX "SellerProfile_sellerType_idx" ON "SellerProfile"("sellerType");

-- CreateIndex
CREATE INDEX "Listing_sellerId_status_idx" ON "Listing"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Listing_organizationId_status_idx" ON "Listing"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Listing_productId_idx" ON "Listing"("productId");

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
