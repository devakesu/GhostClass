"use client";

import { useState, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const STORAGE_KEY = "ghostclass_pwa_install_dismissed";
const SNOOZE_DURATION_MS = 21 * 24 * 60 * 60 * 1000; // 3 weeks
const SHOW_DELAY_MS = 2500;

function shouldShowBanner(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return true;
  if (stored === "installed") return false;
  const dismissedAt = parseInt(stored, 10);
  if (isNaN(dismissedAt)) return true;
  return Date.now() - dismissedAt >= SNOOZE_DURATION_MS;
}

export function PWAInstallBanner() {
  const { canInstall, isInstalled, triggerInstall } = usePWAInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled || !canInstall) return;
    if (!shouldShowBanner()) return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [canInstall, isInstalled]);

  const handleInstall = async () => {
    await triggerInstall();
    localStorage.setItem(STORAGE_KEY, "installed");
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
  };

  return (
    <AnimatePresence>
        {visible && (
          <m.div
            key="pwa-install-banner"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            role="complementary"
            aria-label="Install GhostClass app"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[calc(100vw-2rem)]"
            style={{ paddingRight: "var(--scrollbar-width, 0px)" }}
          >
            <div className="custom-container flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg font-manrope">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 shrink-0">
                <Download className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold leading-tight">Install GhostClass</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  Add to your home screen for a better experience
                </span>
              </div>
              <Button
                size="sm"
                className="shrink-0 h-8 text-xs px-3"
                onClick={handleInstall}
                aria-label="Install GhostClass app"
              >
                Install
              </Button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="shrink-0 flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
  );
}
