# Suivi opérationnel GawJaay — 2026-10-27

Dépôt : https://github.com/aydiarra-star/Gawjaay
Branche : `audit/production-readiness-followup-2026-10-27`
Date des contrôles : 2026-10-27 UTC

## 1. Préservation des données — priorité immédiate

- Base Render : `gawjaay-db`, ID `dpg-db0eqp7avr4c73fccfag-a`.
- État Render : `available`, PostgreSQL 18.6, région Oregon, offre `free`.
- Expiration signalée par Render : `2026-11-02T11:56:20Z`.
- Taille rapportée : environ 11 MB.
- Tables publiques : 33, dont `User`, `Organization`, `Store`, `Product`, `Order`, `Sale`, `Inventory`, `AuditLog` et `_prisma_migrations`.
- Les requêtes de diagnostic n'ont lu que des métadonnées et l'historique des migrations ; aucune donnée métier n'a été modifiée.
- La migration `20261007_m5_4_flash_offer` a une tentative annulée liée à l'ancien type PostgreSQL invalide `DATETIME`, puis une exécution réussie le 13 octobre. La migration suivante `20261008_m5_4_1_commerce_integrity` est également terminée. Aucun état de migration non résolu n'est visible dans le résultat actuel.
- La liste d'accès externe PostgreSQL est `0.0.0.0/0`. Réduire cette exposition après avoir confirmé les besoins d'accès, sans interrompre la connexion interne de l'API.

### Sauvegarde : état honnête

Aucun dump exporté, fichier d'archive vérifié ou test de restauration n'a été créé pendant cette passe. Le connecteur Render disponible ici ne permet que les requêtes SQL en lecture seule et les métadonnées de la base ; il ne fournit pas d'action d'export `pg_dump` ni de téléchargement vérifiable de sauvegarde. L'environnement d'exécution ne dispose pas non plus de `pg_dump`, du Render CLI ou d'une variable de connexion. Ne pas considérer cette base comme sauvegardée.

**Action requise avant le 2 novembre :** depuis le Dashboard Render, ouvrir la base `gawjaay-db` et examiner la section Backups, puis créer un export logique durable avec `pg_dump` (format personnalisé `-Fc`) depuis un environnement autorisé à joindre l'URL externe avec TLS. Garder l'URL de connexion et les identifiants secrets ; ne jamais les coller dans le dépôt ni dans le chat. Après export, vérifier l'archive avec `pg_restore --list fichier.dump`, puis restaurer sur une base séparée pour prouver qu'elle est exploitable. Télécharger l'archive hors de Render. Les snapshots automatiques éventuels ne remplacent pas un export indépendant ni un test de restauration. Ne pas supprimer la base d'origine avant ces contrôles.

Exemple de commande locale, une fois l'URL externe configurée dans une variable d'environnement locale `RENDER_EXTERNAL_DATABASE_URL` (ne pas écrire la valeur dans le shell history) :
```bash
PGSSLMODE=require pg_dump --format=custom --no-owner --no-acl \
  --dbname="$RENDER_EXTERNAL_DATABASE_URL" \
  --file="gawjaay-2026-10-27.dump"
pg_restore --list "gawjaay-2026-10-27.dump" >/dev/null
```
Cette commande n'a pas été exécutée ici.

## 2. API Render

- Service : `gawjaay-api`, ID `srv-db0er27avr4c73fcdlng`.
- État du service : non suspendu, branche `main`, offre `free`, région Oregon.
- Dernier déploiement listé : `dep-db78pam7bikc739ufn8g`, commit `01815adefb7730518f10fd428e411d742c36d4e9`, statut `live`, terminé le 13 octobre.
- Plusieurs déploiements précédents du 13 octobre ont échoué en build/update. Le dernier déploiement listé est néanmoins `live`.
- Les recherches de logs du 20 au 27 octobre ont renvoyé des listes vides ; cela ne prouve ni le succès de la sonde HTTP ni l'absence d'erreurs.
- L'URL publique `/api/v1/health` n'a pas pu être vérifiée depuis le navigateur/outillage disponible. Disponibilité publique, connexion frontend/API et parcours d'inscription restent non confirmés.

## 3. CI et sécurité de déploiement

Les trois runs GitHub Actions examinés pour la branche candidate de la PR #45 ont terminé avec succès :
- Commerce validation, run 71 : installation verrouillée, génération Prisma, typechecks API/web et tests API.
- GawJaay CI, run 52 : typechecks, tests API, build de production et vérification du bundle.
- M5 validation, run 108 : base de test, typechecks, tests API, build/bundle et E2E desktop/mobile.

Ces résultats couvrent la CI de branche, pas l'environnement Render en production.

Les PR #44 (migrations strictes et désactivation du repli destructif) et #45 (CI/configuration frontend) sont toujours documentées comme ouvertes/non fusionnées dans l'audit. Ne pas fusionner #44 avant d'avoir confirmé le comportement de démarrage contre l'état réel de la base : la branche actuelle `main` garde `DB_PUSH_FALLBACK="true"`, et le script de démarrage peut exécuter `prisma db push --accept-data-loss` en dernier recours. Ne pas déclencher manuellement un déploiement pendant la préservation des données.

Le workflow Pages de `main` utilise encore une URL API codée en dur et autorise `workflow_dispatch` sans garde explicite sur `refs/heads/main`. Le correctif de workflow reste bloqué par la permission GitHub `workflow` manquante du jeton courant. Aucune publication n'a été déclenchée.

## 4. Verdict et prochaine séquence

**GawJaay n'est pas encore certifié prêt pour un lancement commercial général.**

1. Exporter et vérifier les données de PostgreSQL hors de Render, puis effectuer une restauration test sur une base séparée.
2. Choisir explicitement comment conserver la base au-delà du 2 novembre (migration ou changement d'offre) ; aucun changement payant n'a été fait.
3. Vérifier l'API publique, la configuration frontend, CORS et les parcours inscription/connexion sur la version réellement déployée.
4. Tester migrations et procédure de récupération sur un environnement isolé ; désactiver le repli `--accept-data-loss` avant un déploiement sûr.
5. Réexaminer l'allowlist PostgreSQL et les fonctions non connectées : paiements, SMS et réinitialisation de mot de passe par email.
6. Ne déclarer la sauvegarde terminée qu'après validation d'un export réel et d'une restauration réussie.

Aucun déploiement, changement de plan, redémarrage, migration de production, achat ou modification de données n'a été effectué pendant ce contrôle.
