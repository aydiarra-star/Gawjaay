# GawJaay — garde-fous opérationnels durables

**Statut actuel : BLOQUÉ avant lancement commercial.** Ce document définit des contrôles permanents, pas une preuve que tous sont déjà activés.

## Règles qui ne doivent jamais être contournées

1. **Aucune migration de production sans sauvegarde vérifiée.** Export logique hors hébergeur, contrôle de l'archive et restauration test sur une base distincte. Une capture d'écran de la section Backups seule ne prouve pas qu'une restauration fonctionne.
2. **Aucune synchronisation destructive automatique.** Ne pas autoriser `prisma db push --accept-data-loss` comme repli de démarrage. Les changements passent par migrations versionnées, revue et CI.
3. **Échec fermé sur erreur de migration.** L'API ne doit pas annoncer qu'elle est prête si le schéma n'est pas compatible. Une migration en échec bloque le déploiement ; procédure de récupération documentée avant toute tentative de réparation.
4. **Séparer readiness et liveness.** Liveness indique que le processus vit ; readiness doit vérifier la base et l'état de migration. Le trafic utilisateur ne doit être accepté que si readiness est positive.
5. **Déploiement réversible.** Tout déploiement doit avoir un commit identifiable, des checks verts, une procédure de rollback et une vérification post-déploiement. Ne jamais faire un rollback de code sans considérer la compatibilité du schéma DB.
6. **Pas d'adresse API inventée.** Le frontend est publié uniquement si `VITE_API_URL` est définie, HTTPS, hôte attendu et terminée par `/api/v1`. Vérifier ensuite l'URL de santé et un parcours utilisateur réel.
7. **Pas de publication depuis une branche de travail.** Tout workflow de publication doit vérifier `github.ref == refs/heads/main` avant le build/publication et avoir les permissions minimales.
8. **Secrets uniquement dans les gestionnaires de secrets.** Aucun secret dans Git, logs, tickets ou conversation. Rotation en cas de divulgation ; ne pas copier de chaînes de connexion dans les rapports.
9. **Accès DB minimal.** Privilégier le réseau privé Render entre services de la même région. Restreindre l'allowlist externe à des IP nécessaires ; ne pas conserver `0.0.0.0/0` sans justification documentée.
10. **Capacités commerciales annoncées seulement si vérifiées.** Paiements, abonnements, webhooks, SMS et récupération par email restent désactivés/non confirmés tant que leurs parcours réels et tests d'intégration ne passent pas.

## Procédure de changement

### Avant chaque release

- [ ] Tous les checks obligatoires passent sur le commit candidat.
- [ ] Les dépendances et changements de schéma sont revus.
- [ ] Une sauvegarde fraîche existe et la dernière restauration testée est récente.
- [ ] Les migrations ont été testées sur une copie représentative de la base.
- [ ] Les variables de production nécessaires sont présentes sans afficher leurs valeurs.
- [ ] Le déploiement cible uniquement `main` et le bon environnement.
- [ ] Le plan de retour arrière est explicite, y compris les changements DB.

### Après chaque release

- [ ] Confirmer le commit et le statut du déploiement dans Render.
- [ ] Vérifier readiness, connexion DB et absence de mode dégradé.
- [ ] Vérifier inscription/connexion et le parcours métier critique avec un compte de test dédié.
- [ ] Contrôler erreurs 5xx, latence, redémarrages et consommation de ressources.
- [ ] Si un contrôle échoue, arrêter les publications suivantes, collecter les logs, revenir à la version sûre si possible et préserver les données.

### Sauvegardes et reprise

- [ ] Export automatique planifié hors de l'hébergeur, chiffré et accès limité.
- [ ] Politique de rétention documentée et vérifiée.
- [ ] Alerte sur échec d'export ou âge de dernière sauvegarde.
- [ ] Restauration périodique sur une base isolée ; consigner date, commit, durée et résultats.
- [ ] La base d'origine n'est jamais supprimée avant une restauration réussie et la validation du propriétaire.

## État concret observé le 27 octobre 2026

- La base Render `gawjaay-db` est sur l'offre gratuite et l'interface signalait une expiration au 2 novembre 2026 à 11:56 UTC.
- Aucun export logique indépendant ni test de restauration n'a été produit par l'outillage de cet audit. **La sauvegarde n'est donc pas confirmée.**
- `render.yaml` sur `main` a `DB_PUSH_FALLBACK: "true"` et décrit un repli `prisma db push --accept-data-loss`. La PR #44 propose de le désactiver, mais il ne faut pas fusionner avant d'avoir confirmé la compatibilité de l'état réel de la base et la procédure de récupération.
- Le service API est listé `live`, mais disponibilité HTTP publique et parcours utilisateur réels ne sont pas confirmés.
- La PR #45 ajoute une validation CI et de l'URL API, mais la garde de branche du workflow Pages et la variable Actions de production restent à vérifier.
- L'allowlist externe de PostgreSQL était `0.0.0.0/0` au moment du contrôle.

## Porte de sortie obligatoire avant lancement

Ne pas autoriser le lancement commercial général avant que tous ces éléments soient vérifiés et consignés :
1. sauvegarde hors hébergeur et restauration réussie ;
2. continuité de la base au-delà de l'expiration, décidée par le propriétaire ;
3. migrations sûres sans repli destructif et readiness cohérente ;
4. API publique et parcours critique testés sur l'environnement candidat ;
5. accès DB minimal, secrets vérifiés, alertes opérationnelles en place ;
6. paiement, SMS, email et obligations légales soit testés, soit explicitement exclus du périmètre annoncé.

## Journal de preuve

Consigner chaque changement avec commit, environnement, résultat de CI, identifiant de déploiement, contrôles post-release et liens vers la preuve. Ne jamais écrire de secrets ou de données personnelles dans ce journal.
