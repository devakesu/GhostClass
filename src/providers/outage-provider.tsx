"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ServiceErrorView } from "@/components/service-error-view";

interface OutageContextValue {
  hasOutage: boolean;
  errorMessages: string[];
  errorDetails?: string;
  setOutage: (messages: string[], details?: string) => void;
  resetOutage: () => void;
}

const OutageContext = createContext<OutageContextValue | null>(null);

export function OutageProvider({ children }: { children: ReactNode }) {
  const [hasOutage, setHasOutage] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | undefined>();

  const setOutage = useCallback((messages: string[], details?: string) => {
    setErrorMessages(messages);
    setErrorDetails(details);
    setHasOutage(true);
  }, []);

  const resetOutage = useCallback(() => {
    setHasOutage(false);
    setErrorMessages([]);
    setErrorDetails(undefined);
  }, []);

  // Handle global custom event for non-React code (like axios)
  useEffect(() => {
    const handleOutageEvent = (
      event: CustomEvent<{ messages: string[]; details?: string }>,
    ) => {
      setOutage(event.detail.messages, event.detail.details);
    };

    window.addEventListener("gc:outage", handleOutageEvent as EventListener);
    return () => {
      window.removeEventListener(
        "gc:outage",
        handleOutageEvent as EventListener,
      );
    };
  }, [setOutage]);

  const value = useMemo(
    () => ({ hasOutage, errorMessages, errorDetails, setOutage, resetOutage }),
    [hasOutage, errorMessages, errorDetails, resetOutage, setOutage],
  );

  return (
    <OutageContext.Provider value={value}>
      {hasOutage
        ? (
          <ServiceErrorView
            messages={errorMessages}
            error={errorDetails}
            onRetry={() => {
              resetOutage();
              window.location.reload();
            }}
          />
        )
        : children}
    </OutageContext.Provider>
  );
}

export function useOutage(): OutageContextValue {
  const context = useContext(OutageContext);

  if (context) {
    return context;
  }

  return {
    hasOutage: false,
    errorMessages: [],
    setOutage: () => {},
    resetOutage: () => {},
  };
}
