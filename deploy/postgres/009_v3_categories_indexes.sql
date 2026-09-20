-- GawJaay V3 — migration 009 : référentiel catégories + index de clés étrangères
-- (source 1:1 : backend/src/migrations/versions/009_v3_categories_indexes.ts)
-- Non destructif : CREATE INDEX IF NOT EXISTS + INSERT ... ON CONFLICT DO NOTHING.

CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customerId);
CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(storeId);
CREATE INDEX IF NOT EXISTS idx_expenses_store_date ON expenses(storeId, date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(saleId);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(orderId);
CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(storeId);
CREATE INDEX IF NOT EXISTS idx_products_store_online ON products(storeId, isOnline, isActive);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(storeId, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(createdAt);

-- Catégories de base (identifiants déterministes cat_<slug>, identiques au runner applicatif).
-- Une ligne déjà présente (slug OU nom déjà utilisé, ex. seed.ts « alimentaire »/« boissons ») est ignorée.
INSERT INTO categories (id, name, slug, parentId, createdAt)
SELECT v.id, v.name, v.slug, NULL, now()::text
FROM (VALUES
  ('cat_alimentaire', 'Alimentaire', 'alimentaire'),
  ('cat_boissons', 'Boissons', 'boissons'),
  ('cat_fruits_legumes', 'Fruits & Légumes', 'fruits-legumes'),
  ('cat_viande_poisson', 'Viande & Poisson', 'viande-poisson'),
  ('cat_boulangerie_patisserie', 'Boulangerie & Pâtisserie', 'boulangerie-patisserie'),
  ('cat_hygiene_beaute', 'Hygiène & Beauté', 'hygiene-beaute'),
  ('cat_sante_pharmacie', 'Santé & Parapharmacie', 'sante-pharmacie'),
  ('cat_menage_entretien', 'Ménage & Entretien', 'menage-entretien'),
  ('cat_bebe_enfants', 'Bébé & Enfants', 'bebe-enfants'),
  ('cat_mode_vetements', 'Mode & Vêtements', 'mode-vetements'),
  ('cat_electronique_telephonie', 'Électronique & Téléphonie', 'electronique-telephonie'),
  ('cat_maison_decoration', 'Maison & Décoration', 'maison-decoration'),
  ('cat_quincaillerie_bricolage', 'Quincaillerie & Bricolage', 'quincaillerie-bricolage'),
  ('cat_papeterie_librairie', 'Papeterie & Librairie', 'papeterie-librairie'),
  ('cat_autres', 'Autres', 'autres')
) AS v(id, name, slug)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = v.slug OR c.name = v.name OR c.id = v.id);
