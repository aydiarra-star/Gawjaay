import { Link } from 'react-router-dom';

const FEATURES = [
  { title: 'Vendre vite', body: 'Encaissement rapide, panier simple, prix calculés par le serveur. Caisse utilisable au comptoir comme sur mobile.' },
  { title: 'Gérer le stock', body: 'Entrées, sorties, transferts et inventaire historisés. Alerte quand un produit passe sous son seuil.' },
  { title: 'Clients & crédit', body: 'Fiche client, historique d\'achats et suivi des restes à payer (crédit).' },
  { title: 'Commandes en ligne', body: 'Boutique publique et commandes, avec suivi de statut de la commande à la livraison.' },
  { title: 'Fournisseurs & achats', body: 'Achats, réceptions et dettes fournisseurs, réconciliés avec le stock réel.' },
  { title: 'Tableau de bord réel', body: 'Chiffre d\'affaires, marge, panier moyen : tous calculés depuis vos données, jamais inventés.' },
];

export function LandingPage() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">
          Gaw<span>Jaay</span>
        </span>
        <div className="topbar-spacer" />
        <div className="row">
          <Link to="/marketplace" className="btn btn-secondary btn-sm">
            Marketplace
          </Link>
          <Link to="/login" className="btn btn-sm">
            Connexion
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <h1>Vendre vite. Gérer mieux.</h1>
          <p className="lead">
            GawJaay réunit la caisse, le stock, les clients, les commandes et la marketplace dans un seul outil pensé pour
            les commerçants du Sénégal.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn">
              Créer ma boutique
            </Link>
            <Link to="/marketplace" className="btn btn-secondary">
              Explorer la marketplace
            </Link>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <h3>{f.title}</h3>
                <p className="muted small">{f.body}</p>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 28 }}>
            Les paiements en ligne (Wave, Orange Money, carte) ne sont pas encore connectés. L'encaissement en espèces et
            la vente à crédit sont pleinement gérés.
          </p>
        </section>
      </main>
    </div>
  );
}
