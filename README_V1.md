# GawJaay V1 - Vendre vite. Gérer mieux.

Plateforme SaaS sénégalaise tout-en-un pour commerçants.

## Démarrage rapide

### Backend
```bash
cd backend
npm install
npx tsx src/seed.ts # seed régions + comptes démo
npm run dev # http://localhost:4000
```

Comptes démo:
- Admin: +221700000001 / Password123!
- Marchand: +221770000001 / Password123!
- Client: +221760000001 / Password123!

### Frontend
```bash
cd frontend
npm install
npm run dev # http://localhost:5173 proxy /api -> 4000
```

### Tests
```bash
cd backend
npm run test # 6 tests verts
```

## API Principale /api/v1

- POST /auth/register, /auth/login, /auth/refresh, /auth/me
- GET /stores/my, POST /stores, GET /stores/slug/:slug, GET /stores/public
- GET /products/store/:storeId, POST /products/store/:storeId
- GET /inventory/:storeId, POST /inventory/:storeId/adjust, /low, /history
- POST /sales/store/:storeId, GET /sales/store/:storeId
- POST /customers, GET /customers/store/:storeId
- GET /debts/store/:storeId, POST /debts/:id/pay
- POST /suppliers, GET /suppliers, POST /suppliers/:id/receive
- POST /expenses/store/:storeId, GET /expenses/store/:storeId
- GET /dashboard/store/:storeId, /dashboard/overview
- POST /orders, GET /orders, PATCH /orders/:id/status
- POST /payments/initiate, POST /payments/:id/verify, POST /payments/webhook/:provider
- GET /deliveries/store/:storeId, PATCH /deliveries/:id/status
- GET /marketplace/products?q=&lat=&lng=&radiusKm=, /marketplace/stores, /marketplace/nearby?lat=&lng=
- GET /notifications, PATCH /notifications/:id/read
- POST /employees/store/:storeId, GET /employees/store/:storeId
- GET /admin/* (ADMIN only), GET /regions

## Sécurité & Règles

- Multi-tenant isolation stricte par merchantId/storeIds
- Stock unique source vérité serveur (transactions + movements)
- Paiement PAYÉ uniquement via confirmation serveur (HMAC webhook)
- RBAC CLIENT/MERCHANT/EMPLOYEE/ADMIN + permissions fines
- Audit logs, rate limiting, Helmet, CORS, Zod validation
- Pas de données inventées, pas de chiffres faux

## Architecture

- Backend: Node22 + Express + TS + node:sqlite (WAL, FK)
- Frontend: React18 + Vite + Tailwind + Zustand + React Router
- 14 régions Sénégal seedées

## V1 Fonctionnelle

Parcours commerçant: compte -> boutique -> produits + stock -> vente physique -> partage boutique WhatsApp -> reçoit commande -> confirme (stock décrémenté) -> paiement Wave/OM sandbox vérifié serveur -> livraison -> dashboard actualisé

Parcours client: recherche produit -> voit boutiques avec stock réel + distance -> choisit boutique -> panier -> commande -> paie Wave/OM sandbox -> suivi -> livrée

Voir docs/RAPPORTS_PHASES.md pour détails phases 0-24.
