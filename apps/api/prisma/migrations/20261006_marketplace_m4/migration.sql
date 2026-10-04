-- Marketplace M4 — « Acheter » : fermer le parcours acheteur.
-- Migration ADDITIVE uniquement : aucune suppression, aucune réécriture destructive.
-- Les commandes existantes conservent clientRequestId = NULL (aucune contrainte
-- violée : PostgreSQL autorise plusieurs NULL dans un index unique composite).

-- AlterTable : clé d'idempotence fournie par l'acheteur (nullable, rétro-compatible).
ALTER TABLE "Order" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex : idempotence par (boutique, clé). Un rejeu réseau renvoie la
-- commande déjà créée au lieu d'en créer une seconde.
CREATE UNIQUE INDEX "Order_storeId_clientRequestId_key" ON "Order"("storeId", "clientRequestId");
