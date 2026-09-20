# Architecture GawJaay

## Stack
- Backend: Node.js + Express + TypeScript + Prisma (SQLite dev / Postgres prod)
- Frontend: React + Vite + Tailwind + Zustand + React Router
- Auth: JWT access 15min + refresh 7j httpOnly, bcrypt 12, rate limit login 5/min

## Modèle multi-tenant
- Merchant 1->N Stores
- Store isolation: toute requête vérifie store.merchantId == user.merchantId ou storeId in user.storeIds (employee)
- Middleware tenantGuard + ensureStoreOwnership

## Stock Unique - Source de vérité serveur
- inventories (storeId, productId, quantity)
- inventory_movements tracés: SALE, ONLINE_ORDER, PURCHASE_RECEIPT, ADJUSTMENT, RETURN, INITIAL
- Transactions Prisma: vérif stock avant décrémentation, rollback si insuffisant

## Commandes - Machine à états
EN_ATTENTE -> CONFIRMEE -> EN_PREPARATION -> PRETE -> EN_LIVRAISON -> LIVREE
Branches ANNULEE, RETOURNEE
- CONFIRMEE: décrémente stock réel
- ANNULEE après CONFIRMEE: restore stock
- Permissions: CLIENT peut annuler EN_ATTENTE, MERCHANT confirme etc

## Paiements
- Abstraction PaymentProvider: WaveSandbox, OMSandbox
- Initiate -> PENDING avec transactionId
- Verify -> serveur seul peut passer SUCCESS (webhook HMAC)
- Idempotency-Key requis
- Notifications paiement confirmé

## Marketplace "Acheter près de moi"
- searchProducts filtre stock réel >0
- Si lat/lng fourni, haversine distance, tri proximité
- Stores publics uniquement digitalStatus OPEN

## Boutique partageable
- slug unique, page publique /store/:slug
- Partage WhatsApp lien direct, QR code (qrcode lib backend)

## Sécurité
- Helmet, CORS strict, rate limiting global 100/min
- Zod validation serveur
- Audit logs toutes actions sensibles
- Pas de secrets en repo

## Régions Sénégal
- 14 régions + departments + communes seedées
- Stores liés à communeId optionnel

## Tests
- Vitest pour unit/integration (à compléter)
- Multi-tenant isolation test, order flow, payment verification
