import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Panier Marketplace (acheteur) — DISTINCT du panier POS marchand.
 *
 * Conservé localement (localStorage) pour M4, mais il n'est JAMAIS la source de
 * vérité : le serveur recalcule prix, stock et total au moment de la commande.
 *
 * Règle : un panier ne contient qu'UNE seule boutique. Ajouter un article d'une
 * autre boutique exige une confirmation explicite (jamais de mélange silencieux).
 */
const CART_KEY = 'gawjaay.cart';

export interface CartItem {
  productId: string;
  variantId: string;
  name: string;
  variantName: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  /** Prix d'affichage ; le serveur reste l'autorité au checkout. */
  unitPrice: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  city: string | null;
  region: string | null;
  quantity: number;
  /** Disponibilité connue au moment de l'ajout (indicative, revérifiée serveur).
   *  `null` = inconnue/non calculable : jamais convertie en 0. */
  available: number | null;
}

export type AddResult = { ok: true } | { ok: false; reason: 'OTHER_STORE'; currentStoreName: string };

interface CartState {
  items: CartItem[];
  storeId: string | null;
  storeName: string | null;
  count: number;
  subtotal: number;
  add: (item: CartItem) => AddResult;
  replaceWith: (item: CartItem) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* préférence locale uniquement */
    }
  }, [items]);

  const add = useCallback((item: CartItem): AddResult => {
    const current = load();
    const otherStore = current.find((i) => i.storeId !== item.storeId);
    if (otherStore && current.length > 0) {
      return { ok: false, reason: 'OTHER_STORE', currentStoreName: current[0].storeName };
    }
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        const cap = item.available == null ? Number.POSITIVE_INFINITY : Math.max(item.available, 1);
        const quantity = Math.min(existing.quantity + item.quantity, cap);
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity, available: item.available } : i));
      }
      return [...prev, item];
    });
    return { ok: true };
  }, []);

  const replaceWith = useCallback((item: CartItem) => {
    setItems([item]);
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(0, Math.floor(quantity)) } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const remove = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartState>(() => {
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    return {
      items,
      storeId: items[0]?.storeId ?? null,
      storeName: items[0]?.storeName ?? null,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal,
      add,
      replaceWith,
      setQuantity,
      remove,
      clear,
    };
  }, [items, add, replaceWith, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>');
  return ctx;
}
