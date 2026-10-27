# GawJaay — garde-fous opérationnels durables

**Statut actuel : bloqué avant lancement commercial général.** Ce runbook définit les règles à appliquer. Il ne prétend pas que toutes les protections sont déjà activées.

## Règles non contournables

1. **Sauvegarde avant changement DB :** aucun changement de schéma de production sans export logique hors de l'hébergeur, archive vérifiée et restauration testée sur une base distincte.
2. **Aucune commande destructive automatique :** ne pas utiliser `prisma db push --accept-data-loss` comme repli de démarrage. Les changements de schéma passent par migrations versionnées, revue et CI.
3. **Échec fermé sur les migrations :** un schéma incompatible ou une migration échouée bloque la readiness et le déploiement. Réparer l'historique de migration seulement après diagnostic et plan de récupération.
4. **Readiness distincte de liveness :** readiness doit vérifier la base et l'état des migrations ; ne pas envoyer de trafic si elle échoue.
5. **Déploiement réversible :** conserver le commit et l'identifiant Render de chaque release, les résultats des checks, la procédure de retour arrière et les contrôles post-déploiement. Évaluer la compatibilité du schéma avant un rollback de code.
6. **Pas d'URL API inventée :** le frontend ne se publie que si `VITE_API_URL` est configurée et validée en HTTPS. Vérifier ensuite la santé réelle de l'API et un parcours utilisateur.
7. **Publication depuis main seulement :** chaque workflow de publication doit vérifier explicitement `github.ref == 'refs/heads/main'` avant toute étape de build/publication.
8. **Secrets protégés :** aucun mot de passe, token ou URL de connexion complète dans Git, les journaux, les tickets ou les conversations. Utiliser les gestionnaires de secrets et faire tourner tout secret divulgué.
9. **Accès minimal :** préférer le réseau privé entre l'API et PostgreSQL dans la même région. Restreindre les IP autorisées à l'accès externe ; ne garder `0.0.0.0/0` que si un besoin documenté le justifie.
10. **Fonctions commerciales vérifiées :** ne pas annoncer les paiements, abonnements, SMS ou récupération de compte par email comme opérationnels sans intégration et tests réels.

## Avant chaque release

- [ ] CI obligatoire verte sur le commit candidat ; dépendances, migrations et configuration revues.
- [ ] Sauvegarde récente hors hébergeur disponible ; dernière restauration testée et documentée.
- [ ] Migrations testées sur une copie représentative de la base.
- [ ] Variables nécessaires présentes sans afficher leurs valeurs.
- [ ] Publication limitée à `main` et au bon environnement.
- [ ] Plan de retour arrière explicite, y compris la compatibilité du schéma DB.

## Après chaque release

- [ ] Vérifier commit, statut Render et identifiant du déploiement.
- [ ] Vérifier readiness, connexion DB et absence de mode dégradé.
- [ ] Tester inscription/connexion et un parcours métier critique avec un compte de test.
- [ ] Contrôler erreurs 5xx, latence, redémarrages et ressources.
- [ ] En cas d'échec : suspendre les releases suivantes, conserver les logs, préserver les données et revenir à la version sûre si cela est compatible avec le schéma.

## Sauvegardes et reprise

- [ ] Export automatique hors hébergeur, chiffré et accessible seulement aux personnes autorisées.
- [ ] Rétention documentée ; alerte en cas d'échec ou d'ancienneté excessive de la sauvegarde.
- [ ] Restauration périodique sur une base isolée ; noter date, commit, durée et résultat.
- [ ] Ne jamais supprimer la base source avant une restauration réussie et une validation explicite.

## État observé le 27 octobre 2026 — risques ouverts

- Render indiquait que `gawjaay-db` (PostgreSQL 18.6, offre gratuite) expirait le **2 novembre 2026 à 11:56 UTC**.
- Aucun export indépendant ni test de restauration n'a été créé par l'audit. **La sauvegarde n'est pas confirmée.**
- `render.yaml` sur `main` contient `DB_PUSH_FALLBACK: "true"` et décrit un repli `prisma db push --accept-data-loss`. La PR #44 propose de le désactiver, mais elle ne doit pas être fusionnée avant de confirmer l'état réel de la base et le plan de reprise.
- Le service API est listé `live`, mais la disponibilité HTTP publique et les parcours utilisateurs réels restent non confirmés.
- La PR #45 ajoute des contrôles CI et d'URL frontend ; la garde de branche du workflow Pages et la variable réelle `VITE_API_URL` restent à vérifier.
- L'allowlist PostgreSQL externe était `0.0.0.0/0`.

## Critères obligatoires avant lancement général

1. Export hors hébergeur et restauration réussie, prouvés.
2. Continuité de la base au-delà de l'expiration décidée par le propriétaire.
3. Migrations sûres sans repli destructif automatique et readiness cohérente.
4. API publique, frontend, CORS et parcours critiques testés sur l'environnement candidat.
5. Accès DB minimal, secrets vérifiés et alertes opérationnelles actives.
6. Paiements, SMS, email et obligations légales testés ou explicitement exclus du périmètre annoncé.

## Journal de preuve

Pour chaque release, enregistrer le commit, l'environnement, les checks CI, l'identifiant de déploiement et les contrôles post-release. Ne jamais inclure de secrets ni de données personnelles.
