GAWDIAYE

« Vendre vite. Gérer mieux. »

1. Vision du projet

GawDiaye est une plateforme numérique destinée aux commerçants, boutiques, magasins, grossistes, petits distributeurs et clients au Sénégal.

L’objectif est de réunir dans une même infrastructure :

* gestion du commerce ;
* gestion du stock ;
* ventes physiques ;
* boutique en ligne ;
* marketplace ;
* commandes ;
* paiements ;
* livraison ;
* gestion des clients ;
* gestion des fournisseurs ;
* gestion des créances ;
* approvisionnement B2B ;
* statistiques commerciales ;
* puis assistance intelligente.

GawDiaye ne doit pas être conçu comme un simple site de petites annonces ou une copie de Vinted/Glovo.

Le concept central est :

Un commerçant possède un commerce physique et obtient automatiquement un commerce numérique accessible 24h/24.

Même lorsque son magasin physique est fermé, ses clients peuvent consulter son catalogue et passer commande selon les conditions qu’il définit.

⸻

2. Problème à résoudre

Une grande partie des petits commerçants doit aujourd’hui gérer séparément :

* les ventes ;
* le stock ;
* les clients ;
* les dettes ;
* les fournisseurs ;
* WhatsApp ;
* les commandes ;
* les paiements ;
* la livraison ;
* la promotion de leurs produits.

GawDiaye doit réunir ces activités dans un seul système simple.

Le commerçant ne doit pas avoir besoin de compétences techniques particulières.

⸻

3. Cibles

Cible principale

* boutiques de quartier ;
* épiceries ;
* magasins ;
* commerces alimentaires ;
* magasins de vêtements ;
* boutiques de beauté ;
* quincailleries ;
* commerces spécialisés ;
* petits distributeurs ;
* vendeurs indépendants ;
* grossistes.

Cible secondaire

* clients particuliers ;
* entreprises ;
* restaurants ;
* autres commerçants recherchant des fournisseurs.

Couverture géographique

Le produit est conçu pour le Sénégal entier.

Le lancement commercial peut commencer par Dakar, mais l’architecture doit prévoir dès le départ :

* Dakar ;
* Thiès ;
* Diourbel ;
* Touba ;
* Mbour ;
* Kaolack ;
* Saint-Louis ;
* Ziguinchor ;
* Louga ;
* Fatick ;
* Kolda ;
* Matam ;
* Kaffrine ;
* Sédhiou ;
* Tambacounda ;
* Kédougou.

Prévoir également régions, départements, communes et quartiers afin de permettre une extension nationale propre.

⸻

4. Proposition de valeur

Pour le commerçant

« Je gère mon commerce physique et ma boutique en ligne depuis une seule application. »

Pour le client

« Je trouve rapidement le produit que je cherche, je vois où il est disponible et je peux commander. »

Pour le grossiste

« Je peux présenter mon catalogue et recevoir des commandes de commerçants. »

⸻

5. Principe fondamental

Un seul stock

Le stock physique et le stock numérique doivent utiliser la même source de vérité.

Exemple :

Stock initial : 20

Vente en boutique : -3

Commande en ligne : -2

Réapprovisionnement : +10

Stock final : 25

Aucune duplication manuelle du stock.

Toutes les opérations importantes sont validées côté serveur.

⸻

6. TYPES DE COMPTES

Client

Peut :

* créer un compte ;
* rechercher des produits ;
* rechercher des boutiques ;
* consulter les catalogues ;
* ajouter au panier ;
* commander ;
* payer ;
* choisir livraison ou retrait ;
* suivre une commande ;
* recevoir des notifications ;
* consulter son historique ;
* noter une commande ;
* signaler un problème.

Commerçant

Peut :

* créer sa boutique ;
* gérer son catalogue ;
* gérer ses stocks ;
* enregistrer ses ventes ;
* gérer ses clients ;
* gérer ses fournisseurs ;
* gérer ses dépenses ;
* gérer ses créances ;
* recevoir des commandes ;
* gérer les livraisons ;
* consulter ses statistiques.

Grossiste

Peut :

* créer son catalogue ;
* gérer son stock ;
* recevoir des commandes B2B ;
* gérer ses clients professionnels ;
* définir ses conditions commerciales ;
* suivre ses ventes.

Employé

Compte rattaché à un commerçant avec permissions spécifiques.

Exemples :

* vendeur ;
* caissier ;
* magasinier ;
* gérant ;
* livreur.

Administrateur

Gestion de la plateforme :

* utilisateurs ;
* commerces ;
* catégories ;
* signalements ;
* commandes ;
* paiements ;
* litiges ;
* contenus ;
* sécurité ;
* statistiques globales.

⸻

7. V1 — MVP COMPLET

La V1 doit rester concentrée sur le fonctionnement fondamental.

MODULE A — Inscription et authentification

* inscription client ;
* inscription commerçant ;
* numéro de téléphone ;
* email optionnel ;
* mot de passe sécurisé ;
* vérification du numéro ;
* connexion ;
* récupération de compte ;
* déconnexion de tous les appareils ;
* gestion des sessions ;
* protection contre les tentatives répétées.

⸻

8. MODULE B — Création de boutique

Lorsqu’un commerçant s’inscrit, il peut créer sa boutique.

Informations :

* nom ;
* catégorie ;
* description ;
* logo ;
* photos ;
* téléphone ;
* WhatsApp ;
* adresse ;
* région ;
* ville ;
* quartier ;
* localisation ;
* horaires ;
* zone de livraison ;
* frais de livraison ;
* délai indicatif ;
* retrait en boutique ;
* moyens de paiement.

Chaque boutique obtient une page publique partageable.

Exemple :

GawDiaye / boutique / nom-du-commerce

Le commerçant peut partager son lien sur WhatsApp, Facebook, Instagram ou SMS.

⸻

9. MODULE C — Catalogue produits

Le commerçant peut :

* ajouter un produit ;
* modifier un produit ;
* supprimer un produit ;
* ajouter une photo ;
* nommer le produit ;
* choisir une catégorie ;
* définir un prix ;
* définir le stock ;
* définir une unité ;
* ajouter une description ;
* indiquer la disponibilité ;
* créer des variantes.

Exemples :

* taille ;
* couleur ;
* poids ;
* conditionnement.

⸻

10. MODULE D — Gestion du stock

Fonctions :

* stock actuel ;
* entrée ;
* sortie ;
* ajustement ;
* inventaire ;
* seuil d’alerte ;
* historique ;
* produits en rupture ;
* produits presque épuisés.

Chaque modification importante doit être enregistrée.

Exemple :

Produit : Huile 1L
Stock précédent : 15
Nouveau stock : 10
Modification : vente
Date : 14h32
Utilisateur : employé X

⸻

11. MODULE E — Ventes physiques

Le commerçant doit pouvoir enregistrer une vente effectuée dans son magasin.

Possibilité de :

* rechercher produit ;
* scanner ultérieurement un code-barres si disponible ;
* choisir quantité ;
* appliquer une remise ;
* choisir moyen de paiement ;
* associer la vente à un client ;
* générer un reçu ;
* diminuer automatiquement le stock.

Moyens de paiement :

* espèces ;
* paiements numériques intégrés ;
* autres moyens disponibles selon les prestataires connectés.

⸻

12. MODULE F — Boutique en ligne

Chaque commerçant dispose automatiquement d’une vitrine.

Le client peut :

* consulter les produits ;
* rechercher ;
* filtrer ;
* voir prix ;
* voir disponibilité ;
* voir informations de la boutique ;
* ajouter au panier ;
* commander.

La boutique peut rester accessible même lorsque le commerce physique est fermé.

Afficher clairement :

Boutique physique : FERMÉE
Boutique en ligne : OUVERTE

Le commerçant choisit ses horaires et règles de commande.

⸻

13. MODULE G — Marketplace

La marketplace permet de rechercher :

Produit

Exemple :

Riz 25 kg

Commerce

Exemple :

Boutique alimentaire

Localisation

Exemple :

Dakar / Parcelles Assainies

Disponibilité

Afficher uniquement les produits dont la disponibilité est déclarée.

Ne jamais présenter comme disponible un produit dont le système sait qu’il est en rupture.

⸻

14. MODULE H — « Acheter près de moi »

Le client peut rechercher un produit et obtenir les commerces qui le proposent dans sa zone.

Informations possibles :

* nom du commerce ;
* distance approximative ;
* disponibilité déclarée ;
* prix ;
* retrait ;
* livraison ;
* horaires.

La localisation doit être utilisée uniquement avec l’autorisation appropriée du client.

⸻

15. MODULE I — Panier et commande

Le client peut :

* ajouter des produits ;
* modifier les quantités ;
* supprimer un produit ;
* choisir l’adresse ;
* choisir retrait ou livraison ;
* choisir le paiement ;
* confirmer la commande.

Statuts :

EN ATTENTE

→ CONFIRMÉE

→ EN PRÉPARATION

→ PRÊTE

→ EN LIVRAISON

→ LIVRÉE

ou :

ANNULÉE

Chaque changement doit être enregistré.

⸻

16. MODULE J — Paiements

Prévoir l’intégration progressive des moyens de paiement disponibles au Sénégal, notamment :

* Wave ;
* Orange Money ;
* autres services de mobile money compatibles ;
* cartes bancaires ;
* paiement en espèces ;
* paiement à la livraison lorsque le commerçant l’autorise.

Les intégrations devront utiliser les API ou solutions officielles des prestataires concernés.

Règles de sécurité

Ne jamais stocker :

* PIN mobile money ;
* codes secrets ;
* informations sensibles inutiles.

Le statut d’un paiement doit être confirmé côté serveur.

Un utilisateur ne doit jamais pouvoir déclarer lui-même :

« Paiement réussi »

Le système doit recevoir une confirmation fiable du prestataire.

Prévoir la gestion :

* paiement réussi ;
* paiement échoué ;
* paiement annulé ;
* paiement expiré ;
* remboursement ;
* double tentative ;
* transaction en attente.

⸻

17. MODULE K — Livraison

V1

Le commerçant peut gérer lui-même la livraison.

Il définit :

* zone desservie ;
* frais ;
* horaires ;
* délai indicatif ;
* disponibilité.

Le client choisit :

Livraison

ou

Retrait en boutique

Le commerçant peut mettre à jour :

* à préparer ;
* prêt ;
* en livraison ;
* livré.

Prévoir une preuve de livraison.

⸻

18. MODULE L — WhatsApp et partage

Chaque boutique doit pouvoir être facilement partagée.

Prévoir :

* bouton WhatsApp ;
* lien de boutique ;
* partage produit ;
* partage catalogue ;
* partage commande.

Objectif :

Le commerçant peut continuer à utiliser WhatsApp tout en faisant passer progressivement ses ventes par GawDiaye.

⸻

19. MODULE M — Gestion des clients

Le commerçant peut enregistrer :

* nom ;
* téléphone ;
* historique des achats ;
* commandes ;
* créances éventuelles ;
* notes internes.

Les données personnelles doivent être protégées et accessibles uniquement aux utilisateurs autorisés.

⸻

20. MODULE N — Gestion des créances

Le commerçant peut suivre les ventes à crédit.

Exemple :

Client : X

Achat : 50 000 FCFA

Paiement : 30 000 FCFA

Reste : 20 000 FCFA

Prévoir :

* historique ;
* paiements partiels ;
* solde ;
* date ;
* rappels.

GawDiaye ne doit pas devenir un organisme de crédit.

Il s’agit uniquement d’un outil de gestion des créances commerciales.

⸻

21. MODULE O — Fournisseurs

Le commerçant peut enregistrer :

* fournisseurs ;
* coordonnées ;
* produits achetés ;
* historique ;
* commandes ;
* montants.

Prévoir les entrées de marchandises.

Lorsqu’une réception est enregistrée :

Stock + quantité reçue

⸻

22. MODULE P — Tableau de bord

Le tableau de bord doit rester simple.

Afficher :

* ventes du jour ;
* ventes de la semaine ;
* commandes ;
* commandes à traiter ;
* dépenses ;
* stock faible ;
* produits en rupture ;
* créances ;
* paiements reçus ;
* chiffre d’affaires.

Ne pas surcharger l’écran avec des statistiques inutiles.

⸻

23. MODULE Q — Reçus

Après une vente ou commande :

* reçu numérique ;
* numéro unique ;
* date ;
* produits ;
* quantités ;
* montant ;
* paiement ;
* boutique.

Le reçu peut être partagé selon les canaux disponibles.

⸻

24. MODULE R — Employés et permissions

Le propriétaire peut créer des comptes employés.

Permissions configurables :

* ventes ;
* stock ;
* commandes ;
* clients ;
* fournisseurs ;
* finances ;
* livraison.

Un employé ne doit jamais avoir accès automatiquement à toutes les données.

⸻

25. MODULE S — Notifications

Notifications pour :

Commerçant

* nouvelle commande ;
* paiement confirmé ;
* produit presque épuisé ;
* produit en rupture ;
* commande annulée ;
* nouvelle demande client.

Client

* commande confirmée ;
* commande préparée ;
* commande en livraison ;
* commande livrée ;
* paiement confirmé ;
* annulation.

Prévoir push notification et, lorsque pertinent, d’autres canaux.

⸻

26. MODULE T — Sécurité V1

La sécurité est une priorité absolue.

Principes :

* HTTPS/TLS ;
* mots de passe correctement hachés ;
* authentification sécurisée ;
* autorisations côté serveur ;
* contrôle d’accès par rôle ;
* isolation des données entre commerçants ;
* validation serveur ;
* protection API ;
* rate limiting ;
* protection contre injections ;
* protection XSS/CSRF selon architecture ;
* validation des fichiers ;
* journalisation ;
* sauvegardes ;
* restauration ;
* surveillance ;
* gestion des sessions ;
* détection d’activité inhabituelle.

Principe fondamental

Le client mobile/web n’est jamais considéré comme une source de vérité.

Le serveur décide :

* prix ;
* stock ;
* paiement ;
* commande ;
* permissions ;
* remboursement ;
* commissions.

⸻

27. MODE HORS CONNEXION

Prévoir une architecture permettant de continuer certaines opérations lorsque la connexion est faible.

Exemple :

Le commerçant enregistre une vente hors connexion.

La vente est conservée localement.

Lorsque la connexion revient :

Synchronisation sécurisée

Prévoir la gestion des conflits.

Les opérations financières sensibles doivent être synchronisées et validées correctement avant d’être considérées comme définitives lorsque cela est nécessaire.

⸻

28. V2 — EXTENSION MAJEURE

La V2 transforme GawDiaye en véritable infrastructure commerciale.

A. Marketplace avancée

* recherche multicritère ;
* catégories ;
* filtres ;
* localisation ;
* disponibilité ;
* promotions ;
* recommandations ;
* favoris ;
* boutiques suivies ;
* historique de recherche.

⸻

29. V2 — GROSSISTES ET B2B

Créer un véritable espace :

Grossistes → Commerçants

Un commerçant peut :

1. rechercher un grossiste ;
2. consulter son catalogue ;
3. sélectionner des produits ;
4. créer une commande ;
5. payer selon les moyens disponibles ;
6. recevoir la marchandise ;
7. intégrer automatiquement les produits dans son stock.

⸻

30. V2 — Réapprovisionnement

Le système détecte les stocks faibles.

Exemple :

Huile : stock faible

Le commerçant peut :

Réapprovisionner

et consulter ses fournisseurs disponibles.

À terme :

historique des ventes → estimation de consommation → suggestion de réapprovisionnement.

Les suggestions doivent être présentées comme des recommandations, pas comme des certitudes.

⸻

31. V2 — Réseau de livraison

Après validation du modèle initial, intégrer des livreurs partenaires.

Architecture :

Client

→ commande

Commerçant

→ préparation

Livreur

→ collecte

Client

→ réception

Le système gère :

* attribution ;
* statut ;
* localisation selon consentement ;
* preuve de livraison ;
* historique ;
* rémunération du livreur.

⸻

32. V2 — Avis et confiance

Après une commande terminée :

Le client peut évaluer :

* produit ;
* expérience commerciale ;
* livraison.

Prévoir :

* avis vérifiés après commande ;
* signalement ;
* modération ;
* lutte contre faux avis ;
* droit de réponse du commerçant.

Créer progressivement des badges factuels :

Commerce vérifié

Téléphone vérifié

Adresse vérifiée

etc.

Ne pas créer de score opaque présenté comme une vérité absolue.

⸻

33. V2 — Promotions

Le commerçant peut créer :

* réduction ;
* produit en promotion ;
* offre limitée ;
* lot ;
* remise sur quantité ;
* promotion pour clients fidèles.

⸻

34. V2 — Fidélité

Prévoir éventuellement :

* clients favoris ;
* points ;
* récompenses ;
* coupons ;
* offres personnalisées.

Les règles doivent être simples et transparentes.

⸻

35. V2 — IA ASSISTANT COMMERÇANT

L’IA ne constitue pas le cœur du produit.

Elle intervient comme assistant.

Exemples :

« Combien ai-je vendu aujourd’hui ? »

« Quels sont mes produits en rupture ? »

« Quels produits se vendent le plus ? »

« Prépare une commande pour mon fournisseur. »

« Crée une fiche produit à partir de cette photo. »

« Résume mon activité de la semaine. »

L’IA doit impérativement respecter une règle :

Elle ne doit jamais inventer une donnée commerciale.

Elle doit utiliser les données réelles disponibles dans le compte.

Lorsqu’une information n’est pas disponible :

« Je ne dispose pas de cette information. »

⸻

36. V2 — Assistant de vente

L’IA peut aider à :

* créer une description produit ;
* catégoriser un produit ;
* répondre à des questions simples ;
* préparer des messages clients ;
* proposer une réponse WhatsApp ;
* résumer une commande ;
* identifier des produits similaires.

Toute action sensible doit nécessiter une validation humaine.

⸻

37. V2 — Analyse commerciale

Afficher des indicateurs tels que :

* évolution des ventes ;
* produits les plus vendus ;
* produits peu vendus ;
* stock dormant ;
* fréquence de réapprovisionnement ;
* créances ;
* évolution des commandes ;
* périodes de forte activité.

Ne pas présenter une estimation comme une donnée comptable certifiée.

⸻

38. ADMINISTRATION CENTRALE

Le back-office doit permettre :

* gestion utilisateurs ;
* gestion commerces ;
* vérification ;
* catégories ;
* produits signalés ;
* commandes ;
* paiements ;
* remboursements ;
* litiges ;
* avis ;
* promotions ;
* sécurité ;
* logs ;
* statistiques ;
* gestion des rôles administrateurs.

Toute action administrative sensible doit être journalisée.

⸻

39. SYSTÈME DE LITIGES

Prévoir :

Client → signalement

Motifs :

* produit non reçu ;
* mauvais produit ;
* produit endommagé ;
* problème de paiement ;
* problème de livraison ;
* autre.

Le commerçant peut répondre.

L’administrateur peut examiner les preuves.

Ne jamais prélever ou transférer automatiquement de l’argent sur la base d’une simple déclaration utilisateur sans mécanisme de vérification adapté.

⸻

40. ARCHITECTURE TECHNIQUE RECOMMANDÉE

L’agent de développement doit construire une architecture moderne, maintenable et évolutive.

Frontend

Application mobile :

* Android prioritaire ;
* iOS ensuite ou simultanément selon ressources.

Interface web responsive pour administration et éventuellement gestion commerçant.

Backend

API sécurisée.

Base de données

Base relationnelle robuste.

Entités principales :

* users ;
* roles ;
* permissions ;
* merchants ;
* stores ;
* employees ;
* products ;
* categories ;
* inventories ;
* inventory_movements ;
* customers ;
* suppliers ;
* sales ;
* sale_items ;
* orders ;
* order_items ;
* payments ;
* deliveries ;
* addresses ;
* debts ;
* debt_payments ;
* notifications ;
* reviews ;
* disputes ;
* audit_logs.

Prévoir une architecture permettant l’ajout ultérieur de :

* wholesalers ;
* B2B orders ;
* drivers ;
* promotions ;
* loyalty ;
* AI interactions.

⸻

41. RÈGLE DE CONCEPTION

Le système doit être modulaire.

Ne pas construire toute l’application dans un seul fichier.

Séparer :

* authentification ;
* utilisateurs ;
* boutiques ;
* produits ;
* stocks ;
* ventes ;
* commandes ;
* paiements ;
* livraison ;
* clients ;
* fournisseurs ;
* marketplace ;
* notifications ;
* administration.

Le code doit être documenté et maintenable.

⸻

42. SÉCURITÉ DES DONNÉES

Mettre en place :

* chiffrement des communications ;
* contrôle d’accès ;
* principe du moindre privilège ;
* isolation des données ;
* sauvegardes ;
* restauration testée ;
* logs ;
* surveillance ;
* protection des secrets ;
* variables d’environnement ;
* rotation des clés lorsque nécessaire ;
* protection des endpoints sensibles.

Les secrets/API keys ne doivent jamais être intégrés directement dans l’application cliente ou déposés publiquement dans GitHub.

⸻

43. PROTECTION CONTRE LA FRAUDE

Prévoir progressivement :

* détection des connexions inhabituelles ;
* limitation des tentatives ;
* détection des commandes suspectes ;
* prévention des doubles paiements ;
* prévention des doubles commandes ;
* contrôle des remboursements ;
* journal d’audit ;
* vérification renforcée des opérations sensibles.

⸻

44. CONFIDENTIALITÉ

Le système doit appliquer :

* collecte minimale des données ;
* accès limité ;
* suppression lorsque légalement possible ;
* export des données lorsque nécessaire ;
* politique de confidentialité claire ;
* consentement lorsque requis ;
* gestion des données de localisation ;
* protection des données de livraison.

Le produit doit être conçu pour respecter les obligations réglementaires applicables au Sénégal et, lorsque nécessaire, aux utilisateurs ou opérations relevant d’autres juridictions.

⸻

45. MODÈLE ÉCONOMIQUE

Prévoir plusieurs sources de revenus.

Offre gratuite

Fonctions essentielles avec limites raisonnables.

Objectif :

faire entrer les commerçants dans l’écosystème.

Offre Pro

Fonctions supplémentaires :

* gestion avancée ;
* statistiques ;
* employés ;
* catalogue plus important ;
* automatisations.

Offre Business

Pour commerces plus importants :

* plusieurs utilisateurs ;
* plusieurs points de vente ;
* fonctions avancées ;
* B2B ;
* rapports.

Marketplace

Possibilité de commission sur certaines transactions.

B2B

Possibilité de services ou commissions liés aux transactions professionnelles.

Livraison

Marge éventuelle lorsque GawDiaye organise ou intermédiarise la livraison.

Le modèle économique exact doit être testé avec les premiers commerçants avant d’être figé.

⸻

46. MULTI-BOUTIQUES

Prévoir l’évolution vers :

1 propriétaire → plusieurs boutiques

Exemple :

Boutique Dakar
Boutique Thiès
Boutique Mbour

Le propriétaire peut consulter chaque magasin séparément ou l’ensemble.

⸻

47. MULTI-UTILISATEURS

Prévoir plusieurs employés par commerce.

Chaque utilisateur doit avoir :

* identité ;
* rôle ;
* permissions ;
* historique des actions ;
* statut actif/inactif.

⸻

48. EXPÉRIENCE UTILISATEUR

L’application doit être :

* simple ;
* rapide ;
* lisible ;
* adaptée aux smartphones ;
* utilisable par des personnes peu technophiles ;
* optimisée pour des connexions variables.

Éviter les interfaces inutilement complexes.

Le commerçant doit pouvoir enregistrer une vente en quelques secondes.

⸻

49. ÉCRANS PRINCIPAUX

Application client

1. Accueil
2. Recherche
3. Catégories
4. Résultats
5. Produit
6. Boutique
7. Panier
8. Paiement
9. Confirmation
10. Suivi commande
11. Historique
12. Profil
13. Favoris
14. Notifications

Application commerçant

1. Tableau de bord
2. Ventes
3. Nouvelle vente
4. Produits
5. Stock
6. Commandes
7. Boutique
8. Clients
9. Créances
10. Fournisseurs
11. Dépenses
12. Paiements
13. Livraisons
14. Employés
15. Statistiques
16. Paramètres

Administration

1. Dashboard
2. Utilisateurs
3. Commerces
4. Produits
5. Commandes
6. Paiements
7. Livraisons
8. Litiges
9. Avis
10. Sécurité
11. Logs
12. Configuration

⸻

50. PRINCIPES ABSOLUS DU PRODUIT

Règle 1

Aucune donnée inventée.

Règle 2

Aucun paiement déclaré comme réussi sans confirmation fiable.

Règle 3

Aucun stock inventé.

Règle 4

Un commerçant ne peut accéder aux données d’un autre commerçant.

Règle 5

Toutes les opérations sensibles sont contrôlées côté serveur.

Règle 6

L’IA ne décide pas seule des opérations financières.

Règle 7

La sécurité doit être intégrée dès le développement initial.

Règle 8

Le produit doit pouvoir fonctionner avec une connexion faible.

Règle 9

L’interface doit rester simple malgré la puissance du backend.

Règle 10

Ne jamais construire une fonctionnalité uniquement parce qu’elle est techniquement possible. Elle doit résoudre un problème réel du commerçant ou du client.

⸻

51. ORDRE DE CONSTRUCTION

Phase 1

Infrastructure :

* projet ;
* base de données ;
* authentification ;
* sécurité ;
* utilisateurs ;
* rôles.

Phase 2

Commerce :

* boutique ;
* produits ;
* stock ;
* ventes ;
* clients ;
* fournisseurs.

Phase 3

Commerce numérique :

* catalogue public ;
* panier ;
* commandes ;
* notifications.

Phase 4

Paiements :

* intégration progressive des moyens disponibles ;
* confirmation serveur ;
* historique ;
* gestion des erreurs.

Phase 5

Livraison :

* retrait ;
* livraison commerçant ;
* suivi.

Phase 6

Marketplace :

* recherche ;
* catégories ;
* disponibilité ;
* recherche géographique.

Phase 7

B2B :

* grossistes ;
* catalogues professionnels ;
* commandes d’approvisionnement.

Phase 8

V2 avancée :

* livreurs partenaires ;
* avis ;
* promotions ;
* fidélité ;
* analyses ;
* IA.

⸻

52. OBJECTIF DU MVP

Le MVP doit permettre à un vrai commerçant de faire ceci :

Créer son compte

↓

Créer sa boutique

↓

Ajouter ses produits

↓

Renseigner son stock

↓

Vendre physiquement

↓

Voir son stock diminuer

↓

Partager sa boutique en ligne

↓

Recevoir une commande

↓

Accepter la commande

↓

Recevoir/confirmer le paiement

↓

Préparer

↓

Livrer ou permettre le retrait

↓

Terminer la commande

↓

Voir automatiquement la vente dans son tableau de bord

Si cette boucle fonctionne parfaitement, GawDiaye possède déjà un produit utilisable.

⸻

53. VISION LONG TERME

GawDiaye doit progressivement devenir :

L’infrastructure numérique du commerce sénégalais.

Un commerçant doit pouvoir gérer depuis une seule plateforme :

son magasin

* son stock
* ses ventes
* ses clients
* ses fournisseurs
* sa boutique en ligne
* ses commandes
* ses paiements
* ses livraisons
* ses achats professionnels
* son activité commerciale

sans devoir utiliser cinq ou dix applications différentes.

⸻

54. SLOGAN

GawDiaye

Vendre vite. Gérer mieux.

Variantes possibles :

GawDiaye — Ton commerce, partout.

GawDiaye — Ton commerce ne ferme jamais.

GawDiaye — Du magasin au numérique.

GawDiaye — Gère. Vends. Livre.

Le slogan principal recommandé pour le lancement doit rester simple et compréhensible.