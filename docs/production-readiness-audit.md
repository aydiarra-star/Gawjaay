# Audit de préparation à la mise en service — GawJaay

Dernière vérification : 2026-10-26 21:15 (Europe/Paris)  
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
- [ ] **Migrations de production sûres.** Le `render.yaml` de `main` fixe `DB_PUSH_FALLBACK="true"`, autorisant le repli `prisma db push --accept-data-loss`. La PR #44 le désactive et fixe `MIGRATIONS_STRICT="true"` ; ses tests de garde-fous et ses workflows passent. Cette option stricte peut toutefois empêcher le démarrage si les migrations réelles sont en échec. Avant toute fusion, examiner les logs de déploiement et l'état de la base existante, puis préparer une procédure de récupération.
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
