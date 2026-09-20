// Simple in-memory cart for demo, but validated server-side at order creation
// In production, use Redis or DB. For V1, we trust client cart but verify stock at checkout (server truth)

export interface CartItem { productId: string; quantity: number; storeId: string; }
export interface Cart { items: CartItem[]; }

export function validateCart(items: CartItem[]): string | null {
  if (!items.length) return 'Panier vide';
  // all items must be from same store
  const storeIds = new Set(items.map(i=>i.storeId));
  if (storeIds.size > 1) return 'Panier multi-boutiques non supporté en V1';
  return null;
}
