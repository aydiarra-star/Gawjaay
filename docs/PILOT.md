# GawJaay V2 — PILOTE TERRAIN (3 à 5 commerçants, 7 jours minimum)

## 1. Objectif

Vérifier le fonctionnement réel du produit dans des commerces réels (Sénégal),
avec un périmètre volontairement **minimal et fiable** :

```
Produit → Stock → Vente (CASH) → Boutique numérique → Commande client → Retrait boutique
```

## 2. Périmètre AUTORISÉ pendant le pilote

- Création produits (nom, prix, stock, seuil, code-barres/SKU optionnels).
- Ventes POS CASH avec monnaie rendue ; décrément de stock traçable.
- Boutique en ligne partageable (WhatsApp) : vitrine + stock réel.
- Commandes clients en ligne avec **RETRAIT boutique** ; préparation côté commerçant.
- Assistant IA (questions données réelles + suggestions réappro confirmées).
- Favoris, recherche marketplace, avis clients, fidélité (optionnel boutique).

## 3. Périmètre DÉSACTIVÉ / NON COMMERCIALISÉ

| Fonction | Statut |
|---|---|
| Wave / Orange Money | **SANDBOX explicite à l'écran** — jamais présentés comme réels |
| Livraison avec livreurs | prête techniquement, non déployée au pilote (retrait only) |
| B2B / réappro fournisseur | disponible mais non demandé aux pilotes |
| Paiement en ligne réel | aucun (aucun contrat officiel signé) |

## 4. Échantillon & durée

- **3 à 5 commerçants maximum** (mêmes conditions : smartphone Android, réseau mobile).
- **7 jours minimum**, mesures quotidiennes.
- Comptes créés par l'équipe (pas d'auto-inscription publique pendant le pilote).

## 5. Collecte des retours

- Journal quotidien par commerçant : ventes réalisées, commandes reçues, incidents, ressenti.
- Canaux : appel/WhatsApp J+1 / J+4 / J+7 (grille : faciliter ? bloquer ? confiance ?).
- Métriques objet côté serveur : ventes/commandes/produits/incidents (SQL + Sentry + logs).
- Données DEMO : **jamais** en production — chaque commerçant démarre avec sa propre boutique vide.

## 6. Procédure de support

1. Niveau 1 : guide express 1 page (créer produit, vendre, partager boutique).
2. Niveau 2 : hotline pilot (à nommer — `INCIDENT_RESPONSE.md` §6).
3. Niveau 3 : exploitant VPS / développement (issues GitHub).

## 7. Critères de sortie du pilote (mesurés, pas déclarés)

| Critère | Seuil de réussite |
|---|---|
| Commerçants réellement actifs | ≥ 3 (≥ 1 vente POS sur 3 jours distincts) |
| Fuite multi-tenant | **0** (matrice d'isolation re-vérifiée en fin de pilote) |
| Faux paiement SUCCESS | **0** |
| Commandes perdues | **0** (chaque commande traçable : statut + horodatage) |
| Ventes dupliquées inexpliquées | **0** (idempotence en place) |
| Stock négatif inexpliqué | **0** |
| Pertes de données | **0** |
| Backups | quotidiens OK + **1 restauration de vérification** pendant le pilote |
| Vulnérabilités CRITICAL/HIGH | 0 non traitée |
| Utilisation IA | ≥ 1 question/action par commerçant actif (indicateur d'adoption) |

## 8. Décision post-pilote

- ✅ Critères atteints → élargissement (10-20 commerçants), activation livraison, contrats paiements.
- ⚠️ Écarts → corrections prioritaires documentées puis pilote complémentaire de 7 jours.
