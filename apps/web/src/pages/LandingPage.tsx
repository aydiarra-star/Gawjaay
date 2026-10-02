import { Link } from 'react-router-dom';
import {
  IconCart,
  IconChart,
  IconLedger,
  IconMarket,
  IconPackage,
  IconShield,
  IconSparkle,
  IconTag,
  IconTruck,
  IconUsers,
} from '../components/icons';

const FEATURES = [
  {
    icon: IconCart,
    title: 'Vendre vite',
    body: "Caisse pensée pour le comptoir comme pour le mobile. Les prix et le stock sont recalculés côté serveur : aucune vente ne peut passer un prix faux.",
  },
  {
    icon: IconTag,
    title: 'Gérer le stock',
    body: "Entrées, sorties, ajustements et inventaires historisés. Une alerte apparaît dès qu'un produit passe sous son seuil.",
  },
  {
    icon: IconUsers,
    title: 'Clients & crédit',
    body: "Fiche client, historique d'achats et suivi du reste à payer. Le crédit est contrôlé par le serveur, jamais par le navigateur.",
  },
  {
    icon: IconMarket,
    title: 'Boutique & marketplace',
    body: "Chaque commerçant obtient une boutique publique partageable, et ses produits rejoignent la marketplace GawJaay.",
  },
  {
    icon: IconTruck,
    title: 'Fournisseurs & achats',
    body: "Bons d'achat, réceptions et dettes fournisseurs. Le stock n'augmente qu'à la réception réelle de la marchandise.",
  },
  {
    icon: IconChart,
    title: 'Comptabilité réelle',
    body: "Chiffre d'affaires, marge, panier moyen, créances et dettes : tout est calculé depuis vos données. Aucun chiffre n'est inventé.",
  },
];

const PILLARS = [
  { icon: IconMarket, label: 'Marketplace' },
  { icon: IconPackage, label: 'Boutique' },
  { icon: IconLedger, label: 'Comptabilité' },
];

export function LandingPage() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">G</span>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />
        <div className="row" style={{ gap: 8 }}>
          <Link to="/marketplace" className="btn btn-ghost btn-sm">
            Marketplace
          </Link>
          <Link to="/login" className="btn btn-secondary btn-sm">
            Connexion
          </Link>
          <Link to="/register" className="btn btn-sm">
            Créer ma boutique
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <span className="eyebrow">
            <span className="dot" />
            Commerce OS pour le Sénégal
          </span>
          <h1>
            Vendre vite.
            <br />
            Gérer mieux.
          </h1>
          <p className="lead">
            GawJaay réunit la caisse, le stock, les clients, les commandes, la comptabilité et la marketplace dans un seul
            outil. Un univers cohérent, pensé pour le comptoir comme pour le téléphone.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-lg">
              <IconSparkle size={18} />
              Créer ma boutique
            </Link>
            <Link to="/marketplace" className="btn btn-secondary btn-lg">
              <IconMarket size={18} />
              Explorer la marketplace
            </Link>
          </div>

          <div className="hero-figure">
            <div className="row between" style={{ marginBottom: 16 }}>
              <div>
                <div className="stat-label">Trois univers, une seule application</div>
                <div className="section-sub">Du produit vendu au chiffre d'affaires, sans changer d'outil.</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {PILLARS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <span key={p.label} className="badge badge-primary">
                      <Icon size={13} />
                      {p.label}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-stats">
              {[
                { k: 'Caisse & ventes', v: 'Prix contrôlés serveur' },
                { k: 'Stock', v: 'Mouvements historisés' },
                { k: 'Clients', v: 'Crédit suivi' },
                { k: 'Comptabilité', v: 'Calculée sur vos données' },
              ].map((s) => (
                <div className="kpi-tile" key={s.k}>
                  <div className="stat-label">{s.k}</div>
                  <div style={{ fontWeight: 620, marginTop: 6, fontSize: '0.95rem' }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="feature-grid">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <article className="feature" key={f.title}>
                  <span className="feature-icon">
                    <Icon size={20} />
                  </span>
                  <h3>{f.title}</h3>
                  <p className="muted small">{f.body}</p>
                </article>
              );
            })}
          </div>

          <div className="section" style={{ maxWidth: 1040, margin: '56px auto 0', textAlign: 'left' }}>
            <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="feature-icon" style={{ marginBottom: 0, flex: '0 0 auto' }}>
                <IconShield size={20} />
              </span>
              <div>
                <h3>Une règle simple : aucune donnée inventée</h3>
                <p className="muted small" style={{ marginTop: 4 }}>
                  Tous les indicateurs proviennent de vos vraies ventes et de votre vrai stock. Un compte neuf affiche
                  zéro, pas des chiffres de démonstration. Les jeux de données d'exemple sont explicitement étiquetés
                  « DEMO ». Les paiements en ligne (Wave, Orange Money, carte) ne sont pas encore connectés :
                  l'encaissement en espèces et la vente à crédit sont pleinement gérés.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)', marginTop: 40, padding: '24px 20px' }}>
        <div className="row between" style={{ maxWidth: 1040, margin: '0 auto' }}>
          <span className="small muted">GawJaay — Vendre vite. Gérer mieux.</span>
          <div className="row" style={{ gap: 16 }}>
            <Link to="/marketplace" className="small">
              Marketplace
            </Link>
            <Link to="/login" className="small">
              Connexion
            </Link>
            <Link to="/register" className="small">
              Créer ma boutique
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
