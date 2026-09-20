-- GawJaay V2 — migration 007 : index production (mesures : voir 007_prod_indexes.ts)
-- inventory_movements(storeId, productId, createdAt) évalué et REJETÉ (plus lent sur la
-- requête de dormance) — réévaluer à volume réel.

CREATE INDEX IF NOT EXISTS idx_sales_store_created ON sales(storeId, createdAt);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_deliveries_store_status ON deliveries(storeId, status);
