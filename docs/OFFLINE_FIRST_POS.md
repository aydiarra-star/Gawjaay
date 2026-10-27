# GawJaay — Plan de caisse offline-first

> Statut : conception préparatoire. **La caisse n'est pas encore utilisable hors ligne.** Ce document ne doit pas être interprété comme une fonctionnalité déjà livrée.

## État actuel observé

- `apps/web/src/pages/PosPage.tsx` charge produits, stock et clients via l'API.
- L'encaissement appelle immédiatement `POST /sales`.
- Le POS transmet déjà un `clientRequestId` pour rendre une tentative réessayable sans créer de doublon, sous réserve de la garantie effective côté serveur.
- `apps/web/src/lib/api.ts` transforme les erreurs réseau en `ApiError`, mais aucune file persistante de ventes hors ligne n'a été identifiée dans le frontend inspecté.

## Principes non négociables

1. Aucune vente locale ne doit disparaître silencieusement, même après rechargement ou redémarrage.
2. Chaque vente possède un identifiant stable réutilisé pour chaque tentative de synchronisation ; l'unicité doit être garantie en base.
3. Le stock local peut être obsolète : le serveur reste l'autorité et doit retourner les conflits clairement.
4. Une vente enregistrée sur l'appareil n'est pas encore une vente synchronisée. Aucun paiement numérique ne doit être présenté comme confirmé sans validation du prestataire.
5. La file est isolée par boutique et organisation ; aucune donnée ne traverse les comptes.
6. Les états sont visibles : « Sur cet appareil », « Synchronisation en cours », « Synchronisée », « À résoudre » et « Échec à réessayer ».
7. Ne jamais stocker les jetons d'authentification dans la file. Limiter les données personnelles conservées localement.

## Architecture cible

### Stockage local
- IndexedDB versionné, avec migrations de schéma.
- Magasins logiques : instantané du catalogue, instantané du stock, ventes en attente et métadonnées de synchronisation.
- Une vente en attente conserve un UUID permanent, le contexte boutique, l'heure locale, les lignes (variantes et quantités), les moyens de paiement autorisés, l'état et le nombre de tentatives.
- Au premier lancement, les ventes à crédit et les paiements numériques peuvent rester en ligne uniquement.

### Parcours de vente
- Précharger catalogue et stock quand le serveur est joignable.
- En ligne : conserver le flux serveur et son identifiant idempotent.
- Hors ligne : n'autoriser que les modes de vente explicitement validés, avec avertissement sur le stock potentiellement obsolète.
- Persister la vente dans IndexedDB avant d'afficher une confirmation locale.
- Ne jamais afficher « synchronisée » avant l'accusé de réception vérifiable du serveur.

### Synchronisation
- Déclenchement à l'événement `online`, à l'ouverture et via un bouton « Réessayer » ; ne pas dépendre uniquement des API Background Sync.
- Envoyer les ventes dans l'ordre, une par une, avec backoff borné.
- Ne retirer une vente en attente qu'après confirmation serveur.
- Pour les conflits métier (stock insuffisant, variante supprimée, boutique inaccessible), conserver la vente et demander une résolution explicite.
- Après un timeout incertain, réutiliser la même clé pour éviter une double vente.

### Vérifications API et base indispensables
- Vérifier que `clientRequestId` est réellement persisté avec une contrainte d'unicité et que les retries retournent la vente initiale.
- Vérifier que création de vente, mouvements de stock et paiements sont atomiques.
- Définir le comportement des prix modifiés, du stock négatif et des variantes désactivées.
- Ne pas déployer de migration risquée sans sauvegarde et test de restauration vérifiés.

## Déploiement progressif

### Phase 0 — Audit du contrat
- [ ] Vérifier le schéma Prisma et l'idempotence effective de `clientRequestId`.
- [ ] Vérifier transactions de stock/paiement et permissions multi-tenant.
- [ ] Définir les modes de paiement admis hors ligne et les conflits acceptables.

### Phase 1 — Fondations frontend
- [ ] Indicateur réseau accessible et états de synchronisation.
- [ ] Stockage IndexedDB versionné et tests unitaires.
- [ ] Persistance du panier brouillon, séparée des ventes encaissées.
- [ ] Tests de quota, stockage indisponible, rechargement et changement de boutique.

### Phase 2 — File de ventes locales
- [ ] Enregistrement durable des ventes locales pour les cas approuvés.
- [ ] État explicite « sur cet appareil — pas encore synchronisée ».
- [ ] Retry, backoff, reprise après fermeture et résolution des conflits.
- [ ] Tests API de répétition et de timeout simulé pour l'idempotence.

### Phase 3 — Qualification terrain
- [ ] Coupure réseau avant encaissement.
- [ ] Coupure après envoi mais avant réponse.
- [ ] Rechargement/redémarrage avec ventes en attente.
- [ ] Réseau intermittent et plusieurs ventes en file.
- [ ] Deux appareils vendant la dernière unité simultanément.
- [ ] Changement de compte/boutique avec file non vide.
- [ ] Sauvegarde/restauration de la base et revue de sécurité.

## Critères d'acceptation

La fonction ne peut être annoncée « offline-first » qu'après réussite des tests, validation du contrat API, absence de doublons lors des retries et démonstration qu'aucune vente locale n'est perdue silencieusement. Un service worker seul ou un indicateur « hors ligne » ne suffit pas.
