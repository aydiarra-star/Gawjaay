/**
 * Configuration d'exécution du frontend GawJaay (GitHub Pages).
 *
 * Ce fichier est servi TEL QUEL par GitHub Pages : il suffit de renseigner
 * `apiUrl` puis de le publier pour pointer le site vers un autre backend,
 * SANS reconstruire l'application ni toucher aux workflows GitHub Actions.
 *
 * Priorité de résolution (voir src/lib/api.ts) :
 *   1. apiUrl (ce fichier)          ← le plus souple, modifiable sans rebuild
 *   2. VITE_API_URL (injecté au build par GitHub Actions)
 *   3. repli local (développement uniquement)
 *
 * Laisser `apiUrl` vide lorsque VITE_API_URL est déjà injecté au build.
 * En production, ne jamais y placer une adresse de boucle locale ni un hôte de
 * bac à sable éphémère : le build échouerait volontairement (scripts/verify-bundle.mjs).
 */
window.__GAWJAAY_CONFIG__ = {
  // Exemple : apiUrl: 'https://gawjaay-api.onrender.com/api/v1',
  apiUrl: '',
};
