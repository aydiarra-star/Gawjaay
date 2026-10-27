import type { PackagingType } from '@gawjaay/shared';

/**
 * Durable storage for POS cart drafts only.
 *
 * This module does not queue sales, confirm payments, or synchronize anything.
 * Drafts are isolated by user + organization + store and never contain tokens.
 */
export interface PosDraftLine {
  productId: string;
  variantId: string;
  name: string;
  price: number;
  quantity: number;
  packaging: PackagingType;
  hasImage: boolean;
  imageUrl: string | null;
}

export interface PosCartDraft {
  userId: string;
  organizationId: string;
  storeId: string;
  cart: Record<string, PosDraftLine>;
  customerId: string;
  payMethod: string;
  paidAmount: string;
  updatedAt: number;
}

interface StoredDraft extends PosCartDraft {
  id: string;
}

const DATABASE_NAME = 'gawjaay-pos-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'cartDrafts';

// Serialize writes for each scope. In particular, a successful checkout's delete
// must run after any draft save already in flight, otherwise that save could
// recreate the cart after the sale was confirmed.
const writeQueues = new Map<string, Promise<void>>();

function enqueueWrite(id: string, operation: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  writeQueues.set(id, current);
  void current.finally(() => {
    if (writeQueues.get(id) === current) writeQueues.delete(id);
  }).catch(() => undefined);
  return current;
}

function requireScope(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Impossible de stocker le brouillon POS : ${name} manquant.`);
  return normalized;
}

function draftId(userId: string, organizationId: string, storeId: string): string {
  return [userId, organizationId, storeId]
    .map((part) => encodeURIComponent(requireScope(part, 'contexte de session')))
    .join(':');
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Le stockage local durable n’est pas disponible dans ce navigateur.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Ouverture du stockage POS impossible.'));
    request.onblocked = () => reject(new Error('Le stockage POS est bloqué par un autre onglet. Fermez les autres onglets GawJaay puis réessayez.'));
  });
}

/** Resolve only after the IndexedDB transaction completes, not merely its request. */
function runRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    let result: T;
    try {
      transaction = db.transaction(STORE_NAME, mode);
      request = action(transaction.objectStore(STORE_NAME));
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    request.onsuccess = () => { result = request.result; };
    request.onerror = () => {
      reject(request.error ?? new Error('Opération de stockage POS impossible.'));
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('La transaction de stockage POS a été annulée.'));
    };
    transaction.onerror = () => {
      // onabort reports the terminal failure; keep this handler to avoid an unhandled event.
    };
  }));
}

/** Persist a cart draft. Call only after the active user/org/store are known. */
export async function savePosCartDraft(
  draft: Omit<PosCartDraft, 'updatedAt'> & { updatedAt?: number },
): Promise<void> {
  const id = draftId(draft.userId, draft.organizationId, draft.storeId);
  const stored: StoredDraft = { ...draft, id, updatedAt: draft.updatedAt ?? Date.now() };
  await enqueueWrite(id, async () => {
    await runRequest<IDBValidKey>('readwrite', (store) => store.put(stored));
  });
}

/** Load only the draft belonging to the exact active user/org/store scope. */
export async function loadPosCartDraft(
  scope: Pick<PosCartDraft, 'userId' | 'organizationId' | 'storeId'>,
): Promise<PosCartDraft | null> {
  const id = draftId(scope.userId, scope.organizationId, scope.storeId);
  const result = await runRequest<StoredDraft | undefined>('readonly', (store) => store.get(id));
  if (!result) return null;
  return {
    userId: result.userId,
    organizationId: result.organizationId,
    storeId: result.storeId,
    cart: result.cart,
    customerId: result.customerId,
    payMethod: result.payMethod,
    paidAmount: result.paidAmount,
    updatedAt: result.updatedAt,
  };
}

/** Remove a draft only from its exact user/org/store scope. */
export async function deletePosCartDraft(
  scope: Pick<PosCartDraft, 'userId' | 'organizationId' | 'storeId'>,
): Promise<void> {
  const id = draftId(scope.userId, scope.organizationId, scope.storeId);
  await enqueueWrite(id, async () => {
    await runRequest<undefined>('readwrite', (store) => store.delete(id));
  });
}
