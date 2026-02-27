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
let _earlyPromptListeners: Array<(e: BeforeInstallPromptEvent) => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    _earlyPrompt = e as BeforeInstallPromptEvent;
    _earlyPromptListeners.forEach((fn) => fn(_earlyPrompt!));
    _earlyPromptListeners = [];
  });
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

    if (_earlyPrompt) {
      // Already captured before mount — nothing more to do, state is already seeded.
    } else {
      // Register for a future fire.
      _earlyPromptListeners.push(handleBeforeInstallPrompt);
    }

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      _earlyPrompt = null;
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      _earlyPromptListeners = _earlyPromptListeners.filter((fn) => fn !== handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
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
