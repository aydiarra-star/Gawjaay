# Audit de préparation à la mise en service — GawJaay

Date de l'audit : 2026-10-26 (Europe/Paris)  
Dépôt : [aydiarra-star/Gawjaay](https://github.com/aydiarra-star/Gawjaay)  
Branche de référence examinée : `main` — `01815adefb7730518f10fd428e411d742c36d4e9`  
Périmètre de travail : PR #44 et PR #45, code versionné et journaux GitHub Actions.  
Limite : cet audit ne certifie pas l'état réel des services hébergés, de la base ou des sauvegardes.

## Verdict

**Pas encore prêt pour un lancement commercial général.** Les vérifications automatisées des deux branches candidates sont vertes, mais elles ne prouvent ni la disponibilité publique de l'API, ni la connexion effective du frontend, ni la sûreté de la base de production, ni la restauration d'une sauvegarde.

## État actuel des PR

| PR | État constaté | Branche / commit de tête | Résultat |
| --- | --- | --- | --- |
| [#44 — sécuriser le démarrage et les migrations](https://github.com/aydiarra-star/Gawjaay/pull/44) | Ouverte, brouillon, non fusionnée | `audit/production-readiness-hardening-2026-10` — `b6e141a67dad01dc1f7a3f918930aa5be716cab2` | 2 workflows réussis |
| [#45 — CI et garde de configuration frontend](https://github.com/aydiarra-star/Gawjaay/pull/45) | Ouverte, brouillon, non fusionnée | `ci/workflow-config-guard` — `4bc8887f8ba30b247152d5f40ea125fbe7e89716` | 3 workflows réussis |

Aucune revue GitHub n'était enregistrée au moment du contrôle. Aucune PR n'a été fusionnée et aucun déploiement de production n'a été déclenché par cet audit.

## Preuves CI vérifiées

Les cinq exécutions ci-dessous sont terminées avec la conclusion GitHub Actions `success`. Les jobs `validate` et leurs étapes affichées sont terminés ; aucun job en échec n'a été observé dans ces exécutions.

| PR | Workflow et exécution | Résultats visibles dans les logs |
| --- | --- | --- |
| #44 | [Commerce validation 2026 — run 59](https://github.com/aydiarra-star/Gawjaay/actions/runs/40384498095) | Installation verrouillée, génération Prisma, typecheck API/web, tests API : **173 tests réussis** (14 fichiers de test) |
| #44 | [M5 validation — run 96](https://github.com/aydiarra-star/Gawjaay/actions/runs/40384498127) | Typecheck, tests API, build et vérification du bundle ; E2E desktop/mobile : **66 réussis** |
| #45 | [Commerce validation 2026 — run 68](https://github.com/aydiarra-star/Gawjaay/actions/runs/40385024256) | Installation verrouillée, génération Prisma, typecheck API/web, tests API : **171 tests réussis** (14 fichiers de test) |
| #45 | [GawJaay CI — run 49](https://github.com/aydiarra-star/Gawjaay/actions/runs/40385024465) | Typecheck des workspaces, tests API, build de production ; vérification du bundle : **8 fichiers contrôlés**, aucune référence localhost/runtime temporaire détectée |
| #45 | [M5 validation — run 105](https://github.com/aydiarra-star/Gawjaay/actions/runs/40385024413) | Typecheck, tests API, build et vérification du bundle ; E2E desktop/mobile : **66 réussis** |

Les logs ont aussi révélé des **avertissements non bloquants**, à traiter avant la mise en service :
- npm signale cinq dépendances dont les scripts d'installation ne sont pas couverts par `allowScripts` : `@prisma/client`, `@prisma/engines`, deux versions d'`esbuild` et `prisma`. Ne pas approuver ces scripts sans revue de leur nécessité et de leur provenance.
- Avertissements de dépréciation Node.js 20 pour `actions/checkout@v4`, `actions/setup-node@v4` et `actions/upload-artifact@v4`, ainsi que des avertissements Node `punycode` et `url.parse()`.
- Un conflit d'enregistrement de cache npm est apparu sur les runs #44 ; le job est néanmoins resté réussi.

**Portée exacte de ces succès :** ce sont des tests automatisés sur les commits de PR, pas une validation du service public. Le workflow Pages de la PR #45 ne s'exécute que sur `push main` ou lancement manuel ; son étape de configuration réelle avec `VITE_API_URL` n'a donc pas été exécutée par les checks de PR. La valeur de cette variable GitHub n'a pas été vérifiée.

## Blocages P0 — avant tout pilote avec données réelles

- [ ] **Connexion réelle frontend/API.** Sur `main`, le workflow Pages écrit encore en dur `https://gawjaay-api.onrender.com/api/v1` dans le bundle publié. Le fichier source `apps/web/public/config.js` contient `apiUrl: ''` ; cela ne permet pas, à lui seul, de déduire la configuration actuellement publiée. La PR #45 remplace l'adresse supposée par la variable Actions `VITE_API_URL` et refuse une valeur absente ou mal formée. Il reste à vérifier que la variable contient la vraie URL, puis à tester `GET /api/v1/health`, inscription, connexion et CORS sur la version publiée.
- [ ] **Migrations de production sûres.** Le `render.yaml` de `main` fixe `DB_PUSH_FALLBACK="true"`, autorisant le repli `prisma db push --accept-data-loss`. La PR #44 le désactive et fixe `MIGRATIONS_STRICT="true"` ; ses tests de garde-fous et ses workflows passent. Cette option stricte peut toutefois empêcher le démarrage si les migrations réelles sont en échec. Le Blueprint versionné déclare aussi `autoDeploy: true` : si le workspace Render applique cette valeur, une fusion vers `main` peut déclencher un déploiement automatique. L'état effectif côté Render n'a pas été vérifié. Avant toute fusion, examiner les logs de déploiement et l'état de la base existante, puis préparer une procédure de récupération.
- [ ] **Sauvegarde et restauration.** Aucun fichier de sauvegarde réel n'a été inspecté et aucun exercice de restauration n'a été réalisé. Définir rétention, chiffrement, droits d'accès et réussir une restauration sur un environnement séparé.
- [ ] **Hébergement durable.** Le Blueprint versionné prévoit encore `plan: free` pour l'API et PostgreSQL. Les limites de cette offre sont documentées dans le dépôt, mais aucun changement payant n'a été effectué. Le propriétaire doit choisir explicitement une offre durable et accepter son coût avant le lancement.
- [ ] **Parcours complet sur environnement candidat.** Les E2E CI passent en environnement de test ; ils ne remplacent pas un test contrôlé de bout en bout contre l'API candidate et la base cible.

## P1 — à résoudre ou à cadrer explicitement

- [ ] **Abonnements payants.** `subscriptions.routes.ts` renvoie `paymentConnected: false` et refuse l'activation des plans payants. Ne pas vendre un abonnement payant avant d'avoir connecté et testé facturation, renouvellement, impayés et annulations.
- [ ] **Vérification SMS.** `phone.routes.ts` et `phone.service.ts` indiquent qu'aucun fournisseur SMS n'est connecté ; la demande renvoie `delivered: false`. Brancher un fournisseur et limiter les tentatives/coûts, ou rendre cette étape non bloquante pour un pilote.
- [ ] **Réinitialisation par email.** `auth.service.ts` ne dispose pas d'envoi email réel ; en production, la demande ne renvoie pas le jeton. Sans fournisseur et lien de réinitialisation opérationnels, le parcours de récupération de compte n'est pas complet.
- [ ] **Paiement carte et webhooks.** Le Blueprint de `main` fixe `PAYMENTS_MODE=disabled`. Le code Stripe présent ne prouve pas qu'un compte éligible, des clés, un webhook et une réconciliation sont configurés. Ne pas annoncer le paiement carte comme opérationnel.
- [ ] **Surveillance et alertes.** La sonde `/api/v1/health` peut répondre HTTP 200 même si le schéma est en mode dégradé. Les alertes doivent contrôler séparément connexion DB, `database.schema`, erreurs API, migrations, déploiements et paiements.
- [ ] **Garde de l'URL d'API.** Le code de la PR #45 vérifie HTTPS, quelques hôtes locaux/IPv4 privés, le suffixe `/api/v1` et l'absence d'identifiants. La validation n'a pas été exécutée dans les checks de PR et le test statique ne prouve pas que le nom d'hôte résout vers un service public. Ajouter des tests dédiés au garde-fou et confirmer la configuration avant publication.
- [ ] **Déclenchement manuel Pages.** Le workflow Pages comporte `workflow_dispatch`, mais le job ne vérifie pas que `github.ref` vaut `refs/heads/main`. Un lancement manuel choisi sur une autre branche peut donc publier le contenu de cette branche sur `gh-pages`. Ajouter un garde-fou de branche avant de permettre les publications manuelles ; aucun lancement manuel n'a été effectué par cet audit.
- [ ] **Sécurité et conformité.** Compléter la revue des permissions, de l'isolation multi-tenant, des sessions, des journaux et des secrets. Faire valider conditions d'utilisation, confidentialité, conservation/suppression des données et obligations applicables aux marchés visés.
- [ ] **Avertissements de dépendances/actions.** Examiner les scripts d'installation signalés par npm, identifier les dépendances responsables de `punycode`/`url.parse()` et migrer les actions GitHub concernées vers des versions compatibles avec le runtime actuel.

## P2 — préparation opérationnelle

- [ ] Guide de démarrage commerçant, canal d'assistance et procédure de signalement d'incident.
- [ ] Tests sur téléphones réels, petits écrans et connexions lentes/instables.
- [ ] Procédure documentée de retour à la version précédente et d'intervention après échec de déploiement.
- [ ] Exercice de restauration périodique et vérification du temps de reprise acceptable.

## Éléments déjà présents dans le dépôt

- Frontend React/Vite, API Express, Prisma et schéma de données.
- Gestion des produits, variantes, stock, ventes, clients/créances, achats, commandes et livraisons.
- Authentification, rôles et middleware central de séparation des organisations.
- Tests API, E2E desktop/mobile et tests de configuration de déploiement/migrations.
- Dockerfile, Blueprint Render et workflows GitHub Actions proposés par les PR.

La présence d'un module ou d'un test n'est pas une preuve de disponibilité ou de sûreté en production.

## Critères de sortie vers un pilote

Le pilote ne commence qu'après validation documentée de ces points :

1. API accessible, frontend connecté à la bonne URL, CORS et inscription/connexion testés sur la version candidate.
2. État réel de la base examiné ; migrations sûres et procédure de récupération validées.
3. Sauvegarde restaurée avec succès sur un environnement séparé.
4. Tests automatisés verts sur le commit candidat, avertissements de dépendances/actions compris et garde `VITE_API_URL` testé.
5. Scénarios réels contrôlés : inscription → boutique → produit → vente/commande → paiement manuel explicitement identifié.

L'ouverture générale exige en plus un hébergement durable, une surveillance active, des procédures d'incident, une récupération de compte fonctionnelle et le cadrage juridique/commercial.

## Limites et actions non effectuées

- Les vérifications réseau directes des URLs publiques n'ont pas abouti depuis cet environnement (échec de résolution DNS/sortie réseau). Cela **ne prouve pas** que le site ou l'API est hors service ; leur disponibilité reste non vérifiée.
- Aucun accès aux ressources Render, aucune modification Render, aucun changement de plan payant et aucune vérification de sauvegarde n'ont été effectués. L'inspection des ressources Render reste bloquée jusqu'à confirmation par le propriétaire du workspace à examiner.
- Les PR #44 et #45 restent des brouillons ouverts et non fusionnés. Aucun déploiement de production n'a été déclenché.


---

## Addendum de suivi — 2026-10-27 (Europe/Paris)

Ce complément remplace les références de tête et de CI plus anciennes ci-dessus lorsque les informations divergent. Il s'appuie sur l'état du fichier récupéré sur la branche d'audit, sur les exécutions GitHub Actions associées au commit `9edfe6e753c87a53e484cc49a94e15655d050cbe`, et sur les jobs de ces exécutions.

### État le plus récent vérifié

- Branche d'audit dédiée créée : `audit/production-readiness-followup-2026-10-27`, à partir du commit `9edfe6e753c87a53e484cc49a94e15655d050cbe`. Ce complément documentaire est isolé des branches de production.
- Les PR #44 et #45 sont toujours documentées ici comme ouvertes, brouillons et non fusionnées ; aucune action de fusion n'a été effectuée par ce suivi.
- Les trois exécutions associées au commit de tête examiné pour la PR #45 sont terminées avec la conclusion `success` :
  - [Commerce validation — run 71](https://github.com/aydiarra-star/Gawjaay/actions/runs/40395544624) : job `validate`, toutes les étapes visibles réussies (installation verrouillée, génération Prisma, typechecks API/web, tests).
  - [GawJaay CI — run 52](https://github.com/aydiarra-star/Gawjaay/actions/runs/40395544629) : toutes les étapes visibles réussies, y compris tests API, build de production et vérification du bundle frontend.
  - [M5 validation — run 108](https://github.com/aydiarra-star/Gawjaay/actions/runs/40395544643) : toutes les étapes visibles réussies, y compris préparation de la base CI, tests API, build/vérification du bundle et E2E desktop/mobile.
- Les trois jobs examinés ne montrent aucun échec de step. Cela confirme uniquement ces exécutions CI, pas le fonctionnement de l'environnement hébergé.
- La lecture des avis de revue GitHub des PR #44 et #45 a renvoyé des listes vides lors de ce contrôle ; aucune revue n'est donc attestée par ce contrôle.

### Vérifications supplémentaires du Blueprint versionné

Le fichier `render.yaml` sur `main` a été relu. Il contient toujours `plan: free` pour le service API et la base PostgreSQL, `autoDeploy: true`, et `DB_PUSH_FALLBACK: "true"`. Ce sont des faits du dépôt ; ils ne prouvent pas les réglages effectifs ni l'état du workspace Render. La configuration de migration reste un blocage avant lancement, car le repli `prisma db push --accept-data-loss` est explicitement décrit dans les commentaires du Blueprint.

### Changements de cette passe

- Création de la branche documentaire dédiée `audit/production-readiness-followup-2026-10-27`.
- Ajout du présent complément à ce document, avec liens directs vers les trois exécutions, état des steps et relecture du Blueprint versionné.
- Aucun code applicatif, workflow de déploiement ou fichier de configuration Render n'a été modifié.
- Aucun workflow n'a été relancé, aucun déploiement déclenché, aucune PR fusionnée et aucun changement payant effectué.

### Blocages inchangés

L'URL réelle et la disponibilité publique de l'API, la configuration Actions `VITE_API_URL`, les tests frontend/API sur l'environnement candidat, les logs de déploiement Render, l'état réel de PostgreSQL, les sauvegardes et une restauration testée restent non vérifiés. Aucun accès Render n'a été entrepris : demander au propriétaire de confirmer explicitement le workspace avant toute inspection. La mise en service reste **non autorisée par cet audit** tant que les critères P0 de la section précédente ne sont pas documentés comme satisfaits.


### Contrôle supplémentaire du workflow Pages — 2026-10-27

Lecture directe de `.github/workflows/deploy-pages.yml` :
- Sur `main` (blob `81c09601f130d85fec3c44e6b5ddb29a4c8cb53e`), le workflow accepte `workflow_dispatch`, installe avec `npm install` et écrit l'URL API `https://gawjaay-api.onrender.com/api/v1` en dur dans `dist/config.js`.
- Sur `ci/workflow-config-guard` (blob `ceb0509920a39dd81ede90f403d85f420f2d37a5`), il utilise `npm ci` et valide `vars.VITE_API_URL` (HTTPS, hôtes locaux/privés ciblés, chemin `/api/v1`, sans query/fragment/identifiants).
- Dans les deux versions, le job ne contrôle pas explicitement que `github.ref == 'refs/heads/main'`. Comme `workflow_dispatch` est autorisé, une exécution manuelle depuis une autre branche pourrait publier sur `gh-pages`. Aucune publication n'a été lancée pendant l'audit.
- La validation de l'URL reste syntaxique et ne prouve ni résolution DNS publique ni disponibilité du service. La valeur réelle de la variable Actions n'a pas été lue.

Action à proposer : ajouter une garde de branche avant les étapes de build/publication et tester le refus d'une référence non-`main` avec un workflow de validation sans effet de publication. Le dépôt indique dans `AGENTS.md` que le jeton courant n'a pas le scope `workflow` nécessaire pour pousser des changements dans `.github/workflows/`; le correctif du workflow est donc bloqué par les permissions actuelles et n'a pas été appliqué.
