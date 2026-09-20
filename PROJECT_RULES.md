# PROJECT_RULES.md — GawJaay

Ce document définit les règles incompressibles de conception, de sécurité et d'architecture pour le développement de la plateforme SaaS GawJaay.

## 1. Source de Vérité
- Le cahier des charges officiel est la référence absolue pour l'architecture, les rôles, les flux et les fonctionnalités.
- Aucune règle métier ne doit être inventée arbitrairement.

## 2. Intégrité des Données et Sécurité
- **Multi-tenant :** L'isolation stricte des données par commerçant doit être garantie au niveau du serveur et de la base de données. Un commerçant ne peut jamais accéder aux données d'un autre.
- **Stock :** Le serveur est l'unique source de vérité. Chaque mouvement de stock (vente physique, commande en ligne, réapprovisionnement) doit être tracé dans des tables dédiées (`inventory_movements`).
- **Paiements :** Aucun paiement ne peut être validé côté client. Seule une confirmation du serveur/passerelle de paiement fait foi.
- **Secrets :** Aucune clé API, secret ou identifiant sensible ne doit jamais être commité sur GitHub ou exposé dans le frontend.

## 3. Méthode de Développement
- Le développement s'effectue strictement par phases (de l'architecture vers les fonctionnalités V1, puis V2).
- Ne jamais casser une fonctionnalité existante sans analyse d'impact préalable.
- Pas de données fictives présentées comme réelles : utiliser des indicateurs de test explicites (`DEMO`).
