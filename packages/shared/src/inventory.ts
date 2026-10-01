/** Types de mouvements de stock (cahier des charges §15). */
export const MOVEMENT_TYPES = [
  'ENTRY', // entrée (réception fournisseur, réappro)
  'EXIT', // sortie manuelle
  'SALE', // vente POS
  'ONLINE_ORDER', // commande en ligne
  'RETURN', // retour client
  'TRANSFER_IN', // transfert entrant (autre boutique)
  'TRANSFER_OUT', // transfert sortant
  'ADJUSTMENT', // ajustement (correction)
  'COUNT', // inventaire physique
  'INITIAL', // stock initial
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Sens du mouvement : +1 augmente le stock, -1 le diminue. */
export function movementSign(type: MovementType): 1 | -1 {
  switch (type) {
    case 'ENTRY':
    case 'RETURN':
    case 'TRANSFER_IN':
    case 'INITIAL':
      return 1;
    case 'EXIT':
    case 'SALE':
    case 'ONLINE_ORDER':
    case 'TRANSFER_OUT':
      return -1;
    case 'ADJUSTMENT':
    case 'COUNT':
      // Le signe est porté par la quantité signée fournie par l'appelant.
      return 1;
  }
}

export function isMovementType(value: unknown): value is MovementType {
  return typeof value === 'string' && (MOVEMENT_TYPES as readonly string[]).includes(value);
}
