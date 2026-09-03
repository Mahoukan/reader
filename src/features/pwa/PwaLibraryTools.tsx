"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatFileSize } from "@/features/reader/core/types";
import { usePwaRegistration } from "./PwaRegistrationProvider";

interface StorageStatus {
  usage?: number;
  available?: number;
  persisted?: boolean;
  canPersist: boolean;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

async function readStorageStatus(): Promise<StorageStatus | null> {
  if (!navigator.storage) return null;
  const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : undefined;
  return {
    usage: estimate.usage,
    available: estimate.quota === undefined ? undefined : Math.max(0, estimate.quota - (estimate.usage ?? 0)),
    persisted,
    canPersist: typeof navigator.storage.persist === "function",
  };
}

export function PwaLibraryTools({ storageRevision }: { storageRevision: number }) {
  const { applyUpdate, updateAvailable } = usePwaRegistration();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [storageMessage, setStorageMessage] = useState("");

  useEffect(() => {
    const onPrompt = (event: BeforeInstallPromptEvent) => { event.preventDefault(); setInstallPrompt(event); };
    const onInstalled = () => { setStandalone(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const alreadyStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone);
    Promise.resolve().then(() => setStandalone(alreadyStandalone));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void readStorageStatus().then((status) => { if (active) setStorage(status); }).catch(() => undefined);
    return () => { active = false; };
  }, [storageRevision]);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setStandalone(true);
  }

  async function protectStorage() {
    if (!navigator.storage?.persist) return;
    setStorageMessage("Requesting persistent storage…");
    try {
      const granted = await navigator.storage.persist();
      setStorage(await readStorageStatus());
      setStorageMessage(granted
        ? "Persistent storage is enabled, though device-level guarantees still depend on the browser and operating system."
        : "The browser did not grant persistence. The library remains in best-effort storage.");
    } catch {
      setStorageMessage("The browser could not complete the persistence request.");
    }
  }

  return <div className="pwa-tools">
    {!standalone && <section className="install-card" aria-label="Install application">
      {installPrompt
        ? <button className="secondary-outline-button compact-button" onClick={() => void install()}>Install app</button>
        : <span>Installation may be available from your browser menu.</span>}
    </section>}

    <section className="storage-card" aria-labelledby="storage-title">
      <div>
        <strong id="storage-title">Local storage</strong>
        {storage ? <p>
          {storage.usage !== undefined && <>Used: {formatFileSize(storage.usage)}</>}
          {storage.available !== undefined && <> · Available: about {formatFileSize(storage.available)}</>}
          {storage.persisted !== undefined && <> · {storage.persisted ? "Persistent" : "Best effort"}</>}
        </p> : <p>Storage estimates are unavailable in this browser.</p>}
        {storageMessage && <p className="storage-message" aria-live="polite">{storageMessage}</p>}
      </div>
      {storage?.persisted === false && storage.canPersist && <button className="secondary-outline-button compact-button" onClick={() => void protectStorage()}>Protect offline library</button>}
    </section>

    {updateAvailable && <section className="update-card" aria-live="polite">
      <span>An app update is ready. It will activate after the app closes.</span>
      <button className="secondary-outline-button compact-button" onClick={applyUpdate}>Update available</button>
    </section>}
  </div>;
}
