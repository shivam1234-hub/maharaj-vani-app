import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAHARAJAS, MaharajConfig } from '../data/maharajas';
import { MaharajKey } from '../data/types';

const ACTIVE_KEY = 'active_maharaj_v1';

interface MaharajContextValue {
  active: MaharajKey;
  maharaj: MaharajConfig;
  setActive: (key: MaharajKey) => void;
  /** False until the saved choice has been read, so the first paint isn't wrong. */
  ready: boolean;
}

const MaharajContext = createContext<MaharajContextValue | null>(null);

export function MaharajProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState<MaharajKey>('radhanath');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_KEY)
      .then((raw) => {
        if (raw && raw in MAHARAJAS) setActiveState(raw as MaharajKey);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setActive = useCallback((key: MaharajKey) => {
    setActiveState(key);
    AsyncStorage.setItem(ACTIVE_KEY, key).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ active, maharaj: MAHARAJAS[active], setActive, ready }),
    [active, setActive, ready],
  );

  return <MaharajContext.Provider value={value}>{children}</MaharajContext.Provider>;
}

export function useMaharaj(): MaharajContextValue {
  const ctx = useContext(MaharajContext);
  if (!ctx) throw new Error('useMaharaj must be used within MaharajProvider');
  return ctx;
}
