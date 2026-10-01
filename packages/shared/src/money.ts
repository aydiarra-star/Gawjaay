/**
 * Utilitaires monétaires. La devise est le Franc CFA (XOF), sans décimale.
 * Tous les montants sont manipulés en entiers (pas de flottants) pour éviter les erreurs d'arrondi.
 */

export const CURRENCY = 'XOF';

/** Convertit un montant en entier sûr (arrondi). Rejette NaN/Infini. */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('Montant invalide');
  return Math.round(amount);
}

export function formatXOF(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
}

/**
 * Calcule le reste dû sur une vente à crédit (cahier §18) : reste = total - somme(paiements réussis).
 * Jamais négatif.
 */
export function remainingBalance(total: number, paid: number): number {
  return Math.max(0, Math.round(total) - Math.round(paid));
}

/** Applique une remise en pourcentage (0..100) puis arrondit. */
export function applyPercentDiscount(amount: number, percent: number): number {
  const p = Math.min(100, Math.max(0, percent));
  return Math.round(amount * (1 - p / 100));
}
