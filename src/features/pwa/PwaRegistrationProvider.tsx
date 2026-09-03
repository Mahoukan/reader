"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface PwaRegistrationState {
  updateAvailable: boolean;
  applyUpdate(): void;
}

const PwaRegistrationContext = createContext<PwaRegistrationState>({
  updateAvailable: false,
  applyUpdate: () => undefined,
});

function scriptUrlOf(registration: ServiceWorkerRegistration): string {
  return registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? "";
}

export function PwaRegistrationProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((candidate) => new URL(scriptUrlOf(candidate), window.location.href).pathname === "/sw.js")
          .map((candidate) => candidate.unregister()),
      )).catch(() => undefined);
      return;
    }

    let disposed = false;
    let activeRegistration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const onStateChange = () => {
      if (installingWorker?.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true);
    };
    const onUpdateFound = () => {
      installingWorker?.removeEventListener("statechange", onStateChange);
      installingWorker = activeRegistration?.installing ?? null;
      installingWorker?.addEventListener("statechange", onStateChange);
    };

    void navigator.serviceWorker.register("/sw.js", { scope: "/", type: "module" }).then((nextRegistration) => {
      if (disposed) return;
      activeRegistration = nextRegistration;
      setRegistration(nextRegistration);
      setUpdateAvailable(Boolean(nextRegistration.waiting));
      nextRegistration.addEventListener("updatefound", onUpdateFound);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      installingWorker?.removeEventListener("statechange", onStateChange);
      activeRegistration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  const value = useMemo<PwaRegistrationState>(() => ({
    updateAvailable,
    applyUpdate: () => {
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      setUpdateAvailable(false);
    },
  }), [registration, updateAvailable]);

  return <PwaRegistrationContext.Provider value={value}>{children}</PwaRegistrationContext.Provider>;
}

export function usePwaRegistration(): PwaRegistrationState {
  return useContext(PwaRegistrationContext);
}
