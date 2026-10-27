# GawJaay — Plan de caisse offline-first

> Statut : conception préparatoire. **La caisse n'est pas encore utilisable hors ligne.** Ce document ne doit pas être interprété comme une fonctionnalité déjà livrée.

## État actuel observé

- `apps/web/src/pages/PosPage.tsx` charge produits, stock et clients via l'API.
- L'encaissement appelle immédiatement `POST /sales`.
- Le POS transmet un `clientRequestId`, mais sa valeur vit dans un `useRef` React : elle n'est pas durable après rechargement ou fermeture de la page.
- `apps/web/src/lib/api.ts` transforme les erreurs réseau en `ApiError`; aucune file persistante de ventes hors ligne n'est présente dans le parcours POS inspecté.
- Le schéma Prisma déclare une unicité composée `@@unique([storeId, clientRequestId])` pour les ventes (la clé est nullable). La vérification applicative doit toujours précéder toute activation hors ligne.
- La route de création encadre la création de vente dans une transaction Prisma ; lignes, mouvements de stock et paiements sont créés au cours de cette transaction. La mise à jour effective du stock est conditionnée côté service inventaire.
- La branche de travail de la PR #55 ajoute la comparaison du contenu lors d'un retry, le traitement d'une collision d'unicité et des tests de répétition/concurrence. Les deux workflows CI de cette branche sont passés. **La PR #55 n'est pas fusionnée : ces garanties ne doivent pas être considérées comme livrées sur `main`.**
- Le contrat côté serveur compare client, remise, lignes et paiements encaissés. Les règles concernant les prix modifiés, les paiements hors ligne, les ventes à crédit et le stock obsolète restent à spécifier et tester avant d'activer une file de ventes.

## Principes non négociables

1. Aucune vente locale ne doit disparaître silencieusement, même après rechargement ou redémarrage.
2. Chaque vente possède un identifiant stable réutilisé pour chaque tentative de synchronisation ; l'unicité doit être garantie en base.
3. Le stock local peut être obsolète : le serveur reste l'autorité et doit retourner les conflits clairement.
4. Une vente enregistrée sur l'appareil n'est pas encore une vente synchronisée. Aucun paiement numérique ne doit être présenté comme confirmé sans validation du prestataire.
5. La file est isolée par boutique, organisation et compte ; aucune donnée ne traverse les sessions. Le changement de compte doit bloquer la synchronisation d'une file appartenant à une autre session.
6. Les états sont visibles : « Sur cet appareil », « Synchronisation en cours », « Synchronisée », « À résoudre » et « Échec à réessayer ».
7. Ne jamais stocker les jetons d'authentification dans la file. Limiter les données personnelles conservées localement.
8. Ne pas déclarer une vente « encaissée » ou « synchronisée » sur la seule base d'un enregistrement local.

## Architecture cible

### Stockage local

- IndexedDB versionné, avec migrations de schéma et gestion explicite des erreurs de quota/stockage.
- Magasins logiques : instantané du catalogue, instantané du stock, ventes en attente et métadonnées de synchronisation.
- Une vente en attente conserve un UUID permanent, l'organisation et la boutique, l'identifiant de session propriétaire (sans jeton), l'heure locale, les lignes (variantes et quantités), les moyens de paiement autorisés, un instantané de prix informatif, l'état et le nombre de tentatives.
- Les données locales ne constituent jamais une preuve de paiement ni une autorisation serveur.
- Au premier lancement, les ventes à crédit et les paiements numériques restent en ligne uniquement, jusqu'à validation métier et technique distincte.

### Parcours de vente

- Précharger catalogue et stock quand le serveur est joignable.
- En ligne : conserver le flux serveur et son identifiant idempotent.
- Hors ligne : n'autoriser que les modes de vente explicitement approuvés, avec avertissement que le stock peut être périmé.
- Persister la vente dans IndexedDB avant d'afficher la confirmation locale.
- Afficher clairement « enregistrée sur cet appareil — pas encore synchronisée » ; ne pas imprimer/afficher de reçu définitif laissant croire à une confirmation serveur si ce n'est pas le statut métier retenu.
- Ne jamais afficher « synchronisée » avant un accusé de réception vérifiable du serveur.

### Synchronisation

- Déclenchement à l'événement `online`, à l'ouverture et via un bouton « Réessayer » ; ne pas dépendre uniquement des API Background Sync.
- Envoyer les ventes dans l'ordre, une par une, avec backoff borné et protection contre deux synchronisations simultanées du même élément.
- Ne retirer une vente en attente qu'après confirmation serveur et enregistrement durable de son identifiant serveur.
- Pour les conflits métier (stock insuffisant, variante supprimée, prix modifié, boutique inaccessible), conserver la vente et demander une résolution explicite ; ne pas réécrire silencieusement son contenu.
- Après un timeout incertain, réutiliser la même clé pour éviter une double vente.
- Un changement de compte ou d'organisation suspend la file précédente jusqu'à ce que l'utilisateur revienne dans le contexte propriétaire ; ne jamais la rejouer avec une autre session.

### Vérifications API et base indispensables

- Vérifier que `clientRequestId` est réellement persisté avec une contrainte d'unicité et que les retries retournent la vente initiale.
- Vérifier que création de vente, mouvements de stock et paiements sont atomiques.
- Définir le comportement des prix modifiés, du stock négatif et des variantes désactivées.
- Confirmer que les erreurs métier ne sont pas confondues avec les erreurs réseau et qu'un conflit de stock ne détruit pas la vente locale.
- Ne pas déployer de migration risquée sans sauvegarde et test de restauration vérifiés.

## Déploiement progressif

### Phase 0 — Audit du contrat

- [x] Vérifier dans le schéma Prisma la contrainte unique composée sur boutique et clé d'idempotence.
- [x] Confirmer que la création de vente, les lignes, les mouvements de stock et les paiements sont traités dans une transaction côté route.
- [x] Inspecter le parcours POS : la clé actuelle est seulement en mémoire et il n'existe pas de file persistante identifiée.
- [ ] Fusionner après revue la PR #55 qui renforce les retries idempotents ; ses workflows CI ont réussi, mais la PR reste ouverte et non fusionnée.
- [ ] Définir les modes de paiement admis hors ligne et les règles de conflit (prix, stock, crédit, remboursements).

### Phase 1 — Fondations frontend

- [ ] Indicateur réseau accessible et états de synchronisation.
- [ ] Stockage IndexedDB versionné et tests unitaires.
- [ ] Persistance du panier brouillon, séparée des ventes encaissées.
- [ ] Tests de quota, stockage indisponible, rechargement et changement de boutique/compte.

### Phase 2 — File de ventes locales

- [ ] Enregistrement durable des ventes locales pour les cas approuvés.
- [ ] État explicite « sur cet appareil — pas encore synchronisée ».
- [ ] Retry, backoff, reprise après fermeture et résolution des conflits.
- [ ] Tests API de répétition, de concurrence et de timeout simulé pour l'idempotence.

### Phase 3 — Qualification terrain

- [ ] Coupure réseau avant envoi.
- [ ] Coupure après envoi mais avant réponse.
- [ ] Rechargement/redémarrage avec ventes en attente.
- [ ] Réseau intermittent et plusieurs ventes en file.
- [ ] Deux appareils vendant la dernière unité simultanément.
- [ ] Changement de compte/boutique avec file non vide.
- [ ] Stockage local plein/indisponible et récupération après erreur.
- [ ] Sauvegarde/restauration de la base et revue de sécurité.

## Critères d'acceptation

La fonction ne peut être annoncée « offline-first » qu'après réussite des tests, validation du contrat API, absence de doublons lors des retries et démonstration qu'aucune vente locale n'est perdue silencieusement. Un service worker seul ou un indicateur « hors ligne » ne suffit pas.
