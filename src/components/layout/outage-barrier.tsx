"use client";

import { useOutage } from "@/providers/outage-provider";
import { ServiceErrorView } from "@/components/service-error-view";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Global Outage Barrier
 *
 * Overlays the entire application with a ServiceErrorView when an outage
 * is detected. This prevents user interaction with potentially stale or
 * broken data during service downtime.
 */
export function OutageBarrier() {
  const { hasOutage, resetOutage } = useOutage();

  return (
    <AnimatePresence>
      {hasOutage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex items-center justify-center bg-background"
        >
          <ServiceErrorView
            onRetry={resetOutage}
            showHome={false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
