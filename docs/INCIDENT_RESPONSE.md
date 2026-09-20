# GawJaay V2 — Réponse à incident (pilote)

## 1. Classification

| Niveau | Définition | Délai de réaction |
|---|---|---|
| S1 | Données perdues/corrompues · fuite inter-tenant · faux paiement réellement encaissé · service down > 30 min | immédiat |
| S2 | Erreurs 5xx en rafale · auth dégradée · backup en échec | < 2 h |
| S3 | Bug gênant, contournement existant | < 48 h |

## 2. S1 — Pertes de données / corruption

1. `pm2 stop gawjaay-api` (stopper l'écriture).
2. Préserver la preuve : copier le DB actuel hors ligne (`incident-<ts>.db`).
3. Restaurer le dernier backup SAIN → `docs/BACKUP_RESTORE.md` §3.
4. Redémarrer + vérifier `/health` + test métier (vente, lecture).
5. Post-mortem écrit sous 48 h (cause, impact, correction, prévention).

## 3. S1 — Suspicion de fuite inter-tenant

1. Ne rien modifier à chaud (préserver les logs).
2. Extraire les traces : `pm2 logs gawjaay-api --lines 2000 --out`, `audit_logs` en base.
3. Vérifier la matrice d'isolation (tests `v2-prod-hardening` + sondes §10 du rapport) —
   si une route fuit : la désactiver côté Nginx (`location { deny all; }`) le temps du fix.
4. Corriger + test de régression + redeployer ; informer les commerçants concernés (obligation de transparence pilote).

## 4. S1 — Paiement anormal

1. Les paiements Wave/OM sont **SANDBOX** : aucune monnaie réelle ne circule — un "SUCCESS"
   sandbox n'engage rien (ne jamais communiquer un succès de paiement réel).
2. CASH : vérifier la vente dans `sales`/`audit_logs` ; une vente erronée se corrige par une
   vente inverse — JAMAIS par écriture directe en base.

## 5. S2 — Service dégradé

1. `pm2 status` / `pm2 restart gawjaay-api` si mémoire/process mort.
2. Nginx : `sudo systemctl status nginx && sudo nginx -t`.
3. Disque plein ? `df -h` (SQLite + logs) — rotation PM2 à vérifier.
4. Sentry : trier les nouvelles erreurs 5xx (régression récente ? rollback §RUNBOOK 3).

## 6. Contacts & escalade (À COMPLÉTER PAR L'EXPLOITANT)

- [ ] Responsable pilote : ____
- [ ] Exploitant VPS : ____
- [ ] Développement : repo GitHub `aydiarra-star/Gawjaay` (issues)
