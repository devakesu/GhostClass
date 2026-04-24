"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface OutageContextValue {
  hasOutage: boolean;
  setOutage: (value: boolean) => void;
  resetOutage: () => void;
}

const OutageContext = createContext<OutageContextValue | null>(null);

export function OutageProvider({ children }: { children: ReactNode }) {
  const [hasOutage, setHasOutage] = useState(false);

  const setOutage = useCallback((value: boolean) => {
    setHasOutage(value);
  }, []);

  const resetOutage = useCallback(() => {
    setHasOutage(false);
  }, []);

  const value = useMemo(
    () => ({ hasOutage, setOutage, resetOutage }),
    [hasOutage, resetOutage, setOutage],
  );

  return (
    <OutageContext.Provider value={value}>{children}</OutageContext.Provider>
  );
}

export function useOutage(): OutageContextValue {
  const context = useContext(OutageContext);

  if (context) {
    return context;
  }

  return {
    hasOutage: false,
    setOutage: () => {},
    resetOutage: () => {},
  };
}
