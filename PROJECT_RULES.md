# PROJECT_RULES.md — GawJaay — Règles Incompressibles

## 1. Vision & Source de Vérité
- Le README.md (cahier des charges) est la référence absolue.
- Aucune donnée métier inventée. Si donnée manquante → "Je ne dispose pas de cette information."
- Le serveur est l'unique source de vérité pour : prix, stock, paiement, permissions, remboursements.

## 2. Sécurité & Multi-Tenant
- **Isolation stricte**: Chaque requête commerçant est filtrée par merchantId/storeId au niveau middleware + requêtes DB. Test d'intrusion inter-tenant obligatoire.
- **Auth**: JWT access (15min) + refresh (7j) httpOnly secure. bcrypt 12 rounds. Rate limit login 5/min/IP. OTP téléphone simulé en dev.
- **RBAC**: Rôles CLIENT, MERCHANT, EMPLOYEE, ADMIN. Permissions fines par employé (resource:action). Middleware authorize().
- **Validation**: Zod côté serveur pour toutes entrées. Pas de confiance client.
- **Secrets**: .env uniquement, jamais commit. .env.example fourni. Clés Wave/OM en sandbox.
- **Audit**: audit_logs pour toutes actions sensibles (vente, stock ajustement, paiement, login, role change).
- **HTTPS**: Helmet, CORS strict, CSRF pour cookies.
- **Paiements**: Statut PAYÉ uniquement via confirmation serveur (webhook vérifié ou polling sécurisé). Pas de statut client.

## 3. Stock Unique — Source de Vérité Serveur
- Table inventories (productId, storeId, quantity) + inventory_movements (product, qty, type, userId, reason, ref).
- Types: SALE, ONLINE_ORDER, PURCHASE_RECEIPT, ADJUSTMENT, RETURN, INITIAL.
- Toute décrémentation/incrementation dans une transaction DB avec SELECT FOR UPDATE / Prisma transaction.
- Vérification stock avant vente/commande. Si rupture → erreur explicite.
- Historique complet consultable.

## 4. Non-Invention & Transparence
- Pas de chiffres faux. Distinction claire: réel / déclaré / estimé / indisponible.
- Seed de démo préfixé DEMO_ et flag isDemo.
- IA assistant (V2) ne peut inventer prix/stock/CA.

## 5. Architecture
- Backend: Node.js + Express + TypeScript + Prisma ORM + SQLite (dev) / PostgreSQL (prod) — schema relationnel robuste.
- Frontend: React + Vite + TS + Tailwind + React Router + Zustand.
- API REST versionnée /api/v1
- Structure modulaire: modules/auth, stores, products, inventory, sales, customers, debts, suppliers, expenses, dashboard, orders, payments, deliveries, marketplace, notifications, employees, admin, regions.
- Multi-régions Sénégal: regions, departments, communes — tables normalisées.

## 6. Paiements Sénégal
- Abstraction PaymentProvider: WaveProvider, OrangeMoneyProvider, CashProvider.
- Mode sandbox sécurisé: simulation confirmation serveur via webhook signé HMAC.
- États paiement: PENDING, SUCCESS, FAILED, CANCELLED, EXPIRED, REFUNDED, DUPLICATE.
- Idempotency-Key obligatoire.

## 7. Commandes — Machine à États
- EN_ATTENTE → CONFIRMEE → EN_PREPARATION → PRETE → EN_LIVRAISON → LIVREE
- Branches: ANNULEE (depuis EN_ATTENTE, CONFIRMEE, EN_PREPARATION), RETOURNEE.
- Transitions contrôlées par rôle: CLIENT peut annuler EN_ATTENTE, MERCHANT confirme/prépare, EMPLOYEE avec permission, ADMIN force.
- Vérification stock à CONFIRMEE.

## 8. Performance & Offline
- Pagination partout (limit 50 max).
- Rate limiting global 100 req/min.
- Mode offline: ventes enregistrées localement puis sync avec gestion conflits (version + timestamp).

## 9. Qualité & Tests
- Tests unitaires: services critiques (stock, paiement, auth).
- Tests d'intégration: multi-tenant isolation, commande flow, paiement.
- Aucune PR sans tests verts pour modules critiques.

## 10. Méthode de Développement
- Phases 0-24 en continu, commits atomiques par phase.
- Rapport technique fin de phase: réalisé, fichiers modifiés, état STABLE.
- Pas de régression: vérifier build backend + frontend avant commit.

## 11. Données & RGPD Sénégal
- Données clients protégées, consentement localisation.
- Téléphone vérifié, commerce vérifié = badges factuels, pas score opaque.
- Logs sans PII sensible.

## 12. Déploiement
- Docker + docker-compose (api, db, frontend)
- Variables d'environnement documentées
- Sauvegarde & restauration scriptées
