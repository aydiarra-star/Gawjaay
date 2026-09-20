# GawJaay — Backlog V3 (Idées et Évolutions Futures)

> Ce document consigne les améliorations identifiées pour les versions futures de GawJaay (V3+).
> **Règle absolue :** Aucune de ces fonctionnalités n'est implémentée dans la phase actuelle de déploiement et pilote.

---

## 1. Paiements & Rapprochement Automatisé
- **Webhooks marchands officiels Wave & Orange Money** : intégration des contrats API de production avec signatures cryptographiques et réconciliation comptable temps réel.
- **Support Free Money & Cartes Bancaires (GIM-UEMOA)** : passerelle unifiée pour les paiements interbancaires régionaux.
- **Règlement automatique des dettes fournisseurs** via split-payment mobile money.

## 2. Logistique & Livraison Avancée
- **Optimisation de tournées de livraison multi-commandes** (VRP - Vehicle Routing Problem) avec calcul d'itinéraires sous contraintes de trafic urbain (Dakar et banlieues).
- **Géolocalisation en direct du livreur** pour le client final via WebSockets/SSE.
- **Intégration transporteurs tiers** (sociétés de livraison locales avec tarification dynamique par zone).

## 3. Marketplace & Réseau B2B
- **Place de marché inter-commerçants (B2B)** avec enchères inversées pour les achats groupés de denrées (riz, sucre, huile).
- **Contrats-cadres de réapprovisionnement automatique** basés sur les prédictions d'épuisement de stock par apprentissage statistique.
- **Système d'évaluation multi-critères des grossistes** (ponctualité, qualité, conformité de facturation).

## 4. Intelligence Artificielle & Automatisation
- **Reconnaissance visuelle de reçus / factures papier** (OCR spécialisé factures manuscrites marchands informels).
- **Prédiction de la demande saisonnière** (fêtes religieuses, début de mois, rentrée scolaire) et suggestions proactives de stock.
- **Support vocal en langues locales (Wolof, Pulaar)** pour la saisie des ventes et l'interrogation du stock via synthèse/reconnaissance vocale locale.

## 5. Expansion Régionale & Infrastructure
- **Support multi-devises (XOF, GNF, EUR)** pour l'expansion sous-régionale (Guinée, Mali, Côte d'Ivoire).
- **Mode offline distribué complet (PWA / SQLite local synchronisé en CRDT)** pour les zones à connectivité intermittente.

## 7. Durcissement technique identifié pendant la phase finale (à traiter AVANT toute montée en charge)

- **Mises à jour conditionnelles de stock (`UPDATE … WHERE quantity >= ?`)** : aujourd'hui les
  opérations sont sûres parce que l'accès base est synchrone (un seul thread, un seul processus).
  En cas de **plusieurs instances Node** (cluster PM2, réplicas), le motif
  « lire → vérifier → écrire » peut produire un stock négatif. Prérequis avant de scaler :
  débit conditionnel atomique + transactions sur `sales`/`orders`.
- **Transactions explicites sur les écritures métier multi-tables** (vente : `sales`,
  `sale_items`, `inventories`, `inventory_movements`, `debts`, fidélité). Repli sûr en cas d'erreur
  en cours de séquence.
- **Verrouillage optimiste/`SELECT … FOR UPDATE`** pour les compteurs de promotions/coupons.
- **Journalisation** : les erreurs 4xx attendues (400/401/403/404) sont aujourd'hui loguées comme
  des erreurs avec pile d'appels → bruit en production, à filtrer.
- **`prisma/` legacy** : plus aucun import de `@prisma/client` dans `src/` ; supprimer
  `prisma/schema.prisma`, `src/lib/prisma.ts`, la dépendance et l'étape `prisma generate`.
- **`deploy/postgres/validate.mjs`** : la métrique « CHECK » comptait en réalité les colonnes
  `NOT NULL` (quirk `information_schema` PostgreSQL : 238 NOT NULL + 13 CHECK = 251). Corriger le
  compteur (les vrais CHECK sont au nombre de 13).
- **Rotation/expiration des refresh tokens** et révocation globale par utilisateur (aujourd'hui :
  révocation par session).
- **Pagination** : plusieurs listes publiques sont plafonnées (`LIMIT`), sans curseur ni total.
