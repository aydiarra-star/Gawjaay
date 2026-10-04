/**
 * Lien WhatsApp factuel vers un vendeur. Ouvre WhatsApp avec un message
 * pré-rempli — ne crée AUCUNE commande GawJaay et n'engage aucun paiement.
 * Renvoie null si aucune coordonnée téléphonique réelle n'existe.
 */
export function storeWhatsappLink(input: {
  storeWhatsapp?: string | null;
  storePhone?: string | null;
  storeName: string;
  productName: string;
  variantName?: string | null;
  quantity?: number;
}): string | null {
  const phone = (input.storeWhatsapp ?? input.storePhone ?? '').replace(/[^0-9]/g, '');
  if (!phone) return null;
  const quantity = input.quantity ?? 1;
  const variant = input.variantName ? ` (${input.variantName})` : '';
  const text = `Bonjour ${input.storeName}, je suis intéressé(e) par « ${input.productName} »${variant} — quantité ${quantity}, vu sur GawJaay.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
