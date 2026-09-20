# GawJaay V2 — RAPPORT FINAL « READY FOR PILOT ? »

Date : 2026-09-20 · Branche : `arena/01a0be50-gawjaay` · PR ouverte vers `main`
Statut final : voir §10 (un seul statut, non ambigu).

---

## 1. Git & versionnage

- HEAD branche de travail : `0f9dcc2` (poussé sur `origin/arena/01a0be50-gawjaay`).
- Historique V2 en commits logiques : index PG (652dfee) → Node 22 CI (5aa2cd1) → Sentry + idempotence 008 (c30c0e8) → fix e2e (6a38655) → masquage costPrice (448cd1d) → docs prod (0bd39b4) → fixes e2e/UI mobile (acfd516, 1a8e93a, 0f9dcc2).
- Aucun `git reset --hard`, aucun `push --force` durant la mission.
- PR `arena/01a0be50-gawjaay` → `main` : ouverte (merger uniquement après relecture).

## 2. Tests

| Suite | Résultat | Preuve |
|---|---|---|
| Vitest backend | **313/313** (13 fichiers) | local + CI Tests SUCCESS (run 35509612942) |
| Build backend (tsc) | OK | local + CI |
| Build frontend (vite + tsc) | OK | local + CI |
| **Playwright E2E en CI** | **8/8 PASSED** | run **35510524010** (green) — 3 projets CI conformes (Node 22) |
| Parité schéma SQLite/PostgreSQL | 53 tables · 64 FK · 247 CHECK ✓ | `deploy/postgres/validate.mjs` sur 9 fichiers SQL (001→008) |

E2E = parcours réels sans mock : recherche → panier → commande (prix serveur) →
POS CASH → workflow commande (Confirmer→Préparation→Prête) → assistant IA (no-invention)
→ multi-tenant → admin. Chromium installé par le workflow GitHub (blocage réseau Arena
contourné par la CI, pas artificiellement).

## 3. Infrastructure

| Élément | État |
|---|---|
| PostgreSQL production | **[À FOURNIR]** — code prêt : `deploy/postgres/` (9 SQL validés + validate.mjs), migrations automatiques au boot (001→008), chaîne idempotente |
| Migrations 001→008 | Validées sur base vierge SQLite ET parité PG vérifiée ; rollback documenté (BACKUP_RESTORE) |
| VPS (Linux, Nginx, PM2, firewall) | **[À FOURNIR]** — procédures complètes dans `docs/PRODUCTION_RUNBOOK.md` + `deploy/` (nginx.conf, ecosystem, service, firewall) |
| Domaine + HTTPS (certbot, redirect) | **[À FOURNIR]** — config Nginx prête dans `deploy/nginx.conf` |
| Secrets serveur | Mechanismes prêts (env only, `backend/.env.example`) ; valeurs prod **[À FOURNIR]** (DATABASE_URL, JWT_SECRET, REFRESH_SECRET, S3, SENTRY_DSN, SMS) |

## 4. Sécurité

- **Audit final §19 : 0 CRITICAL / 0 HIGH non traitée.**
- HIGH corrigée pendant la mission : `GET /products/store/:id` exposait `costPrice`
  (prix d'achat) publiquement → masqué pour tout non-propriétaire + test de régression (448cd1d).
- Matrice multi-tenant (12 sondes API directe A/B) : **10/12 OK + 2 anomalie déjà couvertes** :
  la liste produits est publique par design (vitrine) — désormais sanitisée ; le détail masquait déjà costPrice.
- Rate-limits actifs (global 500/min, login 5/min, IA 30/15 min) ; RBAC vérifié (CLIENT 403 sur
  création promotion, etc.) ; sans token : endpoints protégés → 401.
- Boutique fermée / produit hors-ligne : non exposés en marketplace (test E2E inclus).
- Idempotence `Idempotency-Key` montée sur `POST /orders` et `POST /sales/store/:id`
  (prouvée live : même clé → même commande rejouée ; connexion faible → pas de double vente).

## 5. Backup

- `deploy/backup.sh` : auto-détection SQLite (VACUUM INTO + integrity_check, exit 1 si corrompu)
  / PostgreSQL (pg_dump -Fc + contrôle ≥ 50 tables) ; rétention 14 j ; upload S3 optionnel.
- Cron fourni : `deploy/crontab.example` (backup 02:00 + restauration de contrôle mensuelle).
- **Restauration réellement testée** (SQLite, 2026-09-20) : backup → gunzip → integrity ok,
  8 migrations, données identiques (docs/BACKUP_RESTORE.md §2).
- Reste à exécuter sur le futur serveur PG : 1er backup + 1 restauration de contrôle **[À FOURNIR]**.

## 6. Paiements

- CASH + RETRAIT boutique : opérationnels, testés (E2E + vitest).
- Wave / Orange Money : **SANDBOX explicite à l'écran, jamais présentés comme réels** ;
  aucun encaissement réel (aucun contrat officiel) ; serveur = source de vérité ;
  jamais de SUCCESS côté client sans confirmation serveur.

## 7. Assistant IA

- Questions réelles → réponses chiffrées depuis les ventes réelles (E2E vérifie un FCFA réel).
- Donnée absente → réponse honnête « Je ne dispose pas… » (vérifié E2E).
- Marge : « Je ne dispose pas » sans costPrice ; action IA : suggestion → confirmation → EXECUTED → AUDIT ;
  aucune modification directe prix/paiement/vente/stock/suppression (audit §18 OK).

## 8. Mobile & connexion faible

Bugs bloquants réels trouvés par l'E2E et corrigés pendant la mission :
1. **Page inventaire marchand blanche** (crash React : champs plats `productName` non lus) — corrigé.
2. **Panier marketplace recouvrait le bouton Commander en mobile** (sticky) — corrigé (`lg:sticky`).
3. Race du helper E2E login (token non persisté) — corrigé dans le spec (réel pour la CI).
- Connexion faible : idempotence opérationnelle (commandes/ventes), anti double-tap FE,
  serveur confirmé (pas de SUCCESS optimiste).

## 9. CI/CD

- `CI Tests` : vert (Node 22, vitest 313 + builds BE/FE) — run 35509612942.
- `E2E Playwright` : **VERT** — run 35510524010 (8/8, Chromium réel GitHub Actions).
- Note : cible `ubuntu-latest` migre vers Ubuntu 26 (avertissement GitHub, cosmétique).

## 10. STATUT FINAL

> **TECHNICALLY READY — NOT DEPLOYED**
>
> Tout ce qui est réalisable sans ressources externes est fait, testé et prouvé :
> tests 313/313, E2E vert en CI, PostgreSQL prêt (parité vérifiée), sécurité
> 0 CRITICAL/HIGH, backup avec restauration testée, docs production complètes.
>
> **NON READY FOR PILOT** car les prérequis infra suivants manquent (credentials
> non fournis, donc non déclarables) :
> - VPS + PostgreSQL de production opérationnels [À FOURNIR]
> - Domaine + HTTPS actifs [À FOURNIR]
> - Secrets de production configurés (DATABASE_URL, JWT_SECRET, REFRESH_SECRET, S3, SENTRY_DSN) [À FOURNIR]
> - S3 opérationnel (upload réel testé en prod) [À FOURNIR]
> - Sentry DSN de production configuré + erreur de test visible [À FOURNIR]
> - 1er backup PG + restauration de contrôle exécutés sur le serveur [À FOURNIR]
>
> Dès que ces éléments sont fournis, le déploiement suit `docs/PRODUCTION_RUNBOOK.md`
> puis le pilote `docs/PILOT.md` (3-5 commerçants, ≥ 7 jours, critères de sortie mesurés).

### Blocages (transparents, rien de masqué)

| # | Blocage | Ce qui débloque |
|---|---|---|
| 1 | Aucun VPS/serveur de production fourni | credentials SSH/IP [À FOURNIR] |
| 2 | Aucun domaine fourni | nom de domaine + DNS [À FOURNIR] |
| 3 | S3 non disponible | clés bucket [À FOURNIR] |
| 4 | Sentry DSN prod absent | DSN [À FOURNIR] |
| 5 | Contrats Wave/Orange Money absents | maintien en SANDBOX (pilote CASH+retrait uniquement) |

### Critères §24 — état

OK : commit remote ✓ · tree propre ✓ · 313/313 ✓ · builds ✓ · migrations validées ✓ ·
CI ✓ · Playwright vert ✓ · multi-tenant/RBAC ✓ · 0 CRITICAL/HIGH ✓ · démo isolée ✓ ·
CASH ✓ · retrait ✓ · sandbox paiements ✓ · IA validée ✓ · mobile ✓ · connexion faible ✓ · docs ✓.
PENDANT (credentials) : PG prod · HTTPS · domaine · Nginx réel · PM2 réel · secrets · S3 · Sentry · backup PG réel.
