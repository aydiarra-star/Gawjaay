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
