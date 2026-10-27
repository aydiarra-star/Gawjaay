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
  packaging: string;
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

function requireScope(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Impossible de stocker le brouillon POS : ${name} manquant.`);
  return normalized;
}

function draftId(userId: string, organizationId: string, storeId: string): string {
  return [userId, organizationId, storeId].map((part) => encodeURIComponent(requireScope(part, 'contexte de session'))).join(':');
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Le stockage local durable n’est pas disponible dans ce navigateur.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
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

function runRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>;
    try {
      request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    request.onsuccess = () => {
      const result = request.result;
      db.close();
      resolve(result);
    };
    request.onerror = () => {
      const error = request.error ?? new Error('Opération de stockage POS impossible.');
      db.close();
      reject(error);
    };
  }));
}

/** Persist a cart draft. Call only after the active user/org/store are known. */
export async function savePosCartDraft(
  draft: Omit<PosCartDraft, 'updatedAt'> & { updatedAt?: number },
): Promise<void> {
  const id = draftId(draft.userId, draft.organizationId, draft.storeId);
  const stored: StoredDraft = { ...draft, id, updatedAt: draft.updatedAt ?? Date.now() };
  await runRequest<IDBValidKey>('readwrite', (store) => store.put(stored));
}

/** Load only the draft belonging to the exact active user/org/store scope. */
export async function loadPosCartDraft(
  scope: Pick<PosCartDraft, 'userId' | 'organizationId' | 'storeId'>,
): Promise<PosCartDraft | null> {
  const id = draftId(scope.userId, scope.organizationId, scope.storeId);
  const result = await runRequest<StoredDraft | undefined>('readonly', (store) => store.get(id));
  if (!result) return null;
  const { id: _id, ...draft } = result;
  return draft;
}

/** Remove a draft only from its exact user/org/store scope. */
export async function deletePosCartDraft(
  scope: Pick<PosCartDraft, 'userId' | 'organizationId' | 'storeId'>,
): Promise<void> {
  const id = draftId(scope.userId, scope.organizationId, scope.storeId);
  await runRequest<undefined>('readwrite', (store) => store.delete(id));
}
