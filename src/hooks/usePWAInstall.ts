"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export interface UsePWAInstallReturn {
  canInstall: boolean;
  isInstalled: boolean;
  triggerInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

// Capture the event at module-load time so it is never missed, even if the
// hook mounts after the browser has already fired `beforeinstallprompt`.
// This runs once when the module is first imported (client-side only).
let _earlyPrompt: BeforeInstallPromptEvent | null = null;
// Persistent subscriber set: notified on every `beforeinstallprompt` firing
// (including re-emissions after a previous prompt was consumed), and cleaned
// up on hook unmount to avoid stale references.
const _promptSubscribers = new Set<(e: BeforeInstallPromptEvent) => void>();

// Store a stable module-level listener reference so we don't register
// duplicate listeners during HMR in development.
let _moduleListener: ((e: Event) => void) | null = null;

if (typeof window !== "undefined" && !_moduleListener) {
  _moduleListener = (e: Event) => {
    e.preventDefault();
    _earlyPrompt = e as BeforeInstallPromptEvent;
    _promptSubscribers.forEach((fn) => fn(_earlyPrompt!));
  };
  window.addEventListener("beforeinstallprompt", _moduleListener);
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    // Seed from the early-captured value so the hook is immediately aware
    // if the event already fired before this component mounted.
    () => _earlyPrompt,
  );
  // Initialise synchronously so we never call setState inside an effect body.
  // Chrome/Edge use the display-mode media query; iOS Safari uses navigator.standalone.
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });

  useEffect(() => {
    // If the event fires after this component mounts, update state directly.
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      setDeferredPrompt(e);
    };

    // Always register as a persistent subscriber so we receive any future
    // firings too (e.g. after a previous prompt was consumed and the browser
    // re-emits the event).
    _promptSubscribers.add(handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      _earlyPrompt = null;
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    // Listen for display-mode transitions reactively. When the user adds the
    // app via the browser menu (not via beforeinstallprompt), the 'appinstalled'
    // event does not always fire. A matchMedia listener ensures isInstalled
    // updates correctly in those cases too.
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
        _earlyPrompt = null;
      }
    };
    standaloneQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      _promptSubscribers.delete(handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const triggerInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    _earlyPrompt = null;
    return outcome;
  };

  return {
    canInstall: deferredPrompt !== null && !isInstalled,
    isInstalled,
    triggerInstall,
  };
}
