import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { getStoreId, setStore } from '../lib/session';
import { useAuth } from './AuthContext';

export interface Store {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  city: string | null;
  region: string | null;
}

interface StoreState {
  stores: Store[];
  storeId: string | null;
  loading: boolean;
  setStoreId: (id: string) => void;
  refreshStores: () => Promise<void>;
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { organizationId } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreIdState] = useState<string | null>(getStoreId());
  const [loading, setLoading] = useState(false);

  const refreshStores = useCallback(async () => {
    if (!organizationId) {
      setStores([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<{ stores: Store[] }>('/stores');
      setStores(data.stores);
      const current = getStoreId();
      if (data.stores.length > 0 && (!current || !data.stores.some((s) => s.id === current))) {
        setStore(data.stores[0].id);
        setStoreIdState(data.stores[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshStores();
  }, [refreshStores]);

  const setStoreId = useCallback((id: string) => {
    setStore(id);
    setStoreIdState(id);
  }, []);

  const value = useMemo<StoreState>(
    () => ({ stores, storeId, loading, setStoreId, refreshStores }),
    [stores, storeId, loading, setStoreId, refreshStores],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé dans <StoreProvider>');
  return ctx;
}
