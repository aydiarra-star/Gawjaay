# Audit de préparation à la mise en service — GawJaay

Date : 2026-10-26  
Dépôt examiné : `aydiarra-star/Gawjaay`, branche `main`  
Nature : audit documentaire du dépôt et de la configuration versionnée. Ce document ne certifie pas l'état réel des services hébergés.

## Verdict

**Pas encore autorisé pour un lancement commercial général.** Une base fonctionnelle est présente, mais la disponibilité réelle de l'API, l'état de la base de production, les sauvegardes restaurables et les contrôles de lancement n'ont pas été confirmés.

## Blocages P0 — à lever avant un pilote avec données réelles

- [ ] **API et frontend réellement connectés.** Le workflow Pages de `main` écrivait une URL Render fixe dans `config.js`. Il faut utiliser l'URL réelle, vérifier `GET /api/v1/health`, puis tester inscription et connexion. La PR #45 propose une variable Actions `VITE_API_URL` validée, sans adresse supposée.
- [ ] **Migrations non destructives.** Le Blueprint Render de `main` active `DB_PUSH_FALLBACK=true`, qui peut déclencher `prisma db push --accept-data-loss` après un échec des migrations. La PR #44 propose de désactiver ce repli et d'exiger des migrations réussies. Avant fusion, contrôler les logs et l'état réel de la base afin de ne pas bloquer un service existant.
- [ ] **Sauvegarde et restauration.** Aucune restauration réelle n'a été exécutée pendant cet audit. Définir une sauvegarde chiffrée, une rétention, des accès restreints et réussir un exercice de restauration sur un environnement séparé.
- [ ] **Tests de la version publiée.** Le README rapporte des tests locaux réussis, mais aucun résultat CI vérifiable n'a été renvoyé pour les commits examinés. La PR #45 ajoute un workflow de typecheck, tests API et build ; ses résultats doivent être vérifiés avant fusion.
- [ ] **Hébergement durable.** Le Blueprint Render utilise `plan: free` pour l'API et la base. Le README avertit que le service peut s'endormir et que la base gratuite expire au bout de 90 jours. Choisir une offre durable, en connaissance du coût, avant le lancement.

## P1 — à résoudre ou à cadrer explicitement avant commercialisation

- [ ] **Abonnements GawJaay.** La route `apps/api/src/routes/subscriptions.routes.ts` indique `paymentConnected: false` et refuse l'activation des plans payants. Définir tarifs, facturation, renouvellement, impayés et annulations ; ne pas vendre un abonnement payant tant que le parcours serveur n'est pas opérationnel.
- [ ] **SMS de vérification.** `apps/api/src/routes/phone.routes.ts` et `phone.service.ts` précisent qu'aucun fournisseur SMS n'est connecté et que `delivered: false` est renvoyé. Brancher un fournisseur et protéger les coûts/tentatives, ou rendre cette vérification non obligatoire au pilote.
- [ ] **Récupération de mot de passe par email.** `apps/api/src/services/auth.service.ts` indique que le jeton n'est exposé qu'en non-production et qu'en production il devrait être envoyé par email, mais aucun fournisseur d'email n'a été trouvé dans le dépôt. Sans cette intégration, un utilisateur qui perd son mot de passe risque de ne pas pouvoir récupérer son compte. Ajouter l'envoi sécurisé, une URL de réinitialisation publique, et tester expiration, usage unique et révocation des sessions.
- [ ] **Paiements en ligne.** Le Blueprint fixe `PAYMENTS_MODE=disabled`. Le code Stripe existe, mais l'activation et les webhooks doivent être testés avec des clés de test, puis de production, avant toute affirmation de paiement automatisé. Distinguer clairement règlement manuel déclaré et confirmation automatique du fournisseur.
- [ ] **Surveillance et alertes.** La sonde `/api/v1/health` répond HTTP 200 même en mode dégradé. Surveiller séparément la connexion à la base, l'état du schéma, les erreurs API, les déploiements et les paiements.
- [ ] **Sécurité et conformité.** Compléter une revue des permissions et de l'isolation entre organisations, des sessions, de la récupération de compte, des journaux et de la gestion des secrets. Faire valider les conditions d'utilisation, la politique de confidentialité, la conservation/suppression des données et les obligations applicables aux pays visés.

## P2 — préparation opérationnelle

- [ ] Guide de démarrage commerçant, canal d'assistance et procédure de signalement d'incidents.
- [ ] Tests sur téléphones réels, petits écrans et connexions lentes/instables.
- [ ] Procédure documentée de retour à la version précédente et d'intervention après échec de déploiement.

## Éléments déjà présents dans le dépôt

- Frontend React/Vite, API Express, Prisma et schéma de données.
- Gestion des produits, variantes, stock, ventes, clients/créances, achats, commandes et livraisons.
- Authentification, rôles et middleware central de séparation des organisations.
- Tests API et tests ciblant l'infrastructure/migrations.
- Configuration Docker et Blueprint Render.

La présence d'un module ou d'un test n'est pas une preuve de disponibilité en production.

## Critères de sortie vers un pilote

Le pilote ne commence qu'après validation documentée de ces cinq points : (1) API accessible et frontend connecté, (2) migrations sûres, (3) sauvegarde restaurée avec succès, (4) tests automatisés verts sur le commit candidat, (5) scénarios réels inscription → boutique → produit → vente/commande → paiement manuel clairement identifié. L'ouverture générale exige en plus un hébergement durable, surveillance, procédures d'incident et cadrage juridique/commercial.

## Limites de cet audit

- Les outils de ce travail n'ont pas permis de vérifier directement l'URL publique ni de confirmer le statut réel des services.
- L'accès aux ressources Render nécessite que le propriétaire confirme le workspace à inspecter ; aucune ressource Render n'a été modifiée.
- Les PR #44 et #45 sont des propositions en brouillon. Aucune n'est fusionnée et aucun déploiement de production n'a été déclenché par cet audit.
