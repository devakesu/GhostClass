'use client';
import { useBuildInfo } from '@/hooks/use-build-info';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useEffect, useState } from 'react';

export const LoadingBlur = ({ isLoading, children }: { isLoading: boolean; children: React.ReactNode }) => {
  const { buildInfo } = useBuildInfo();
  const isLegacy = buildInfo?.is_legacy ?? false;

  const [delayedLoading, setDelayedLoading] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isLoading) {
      timeout = setTimeout(() => setDelayedLoading(true), 50);
    } else {
      timeout = setTimeout(() => setDelayedLoading(false), 0);
    }
    return () => clearTimeout(timeout);
  }, [isLoading]);

  return (
    <div className="relative min-h-full w-full grow">
      <AnimatePresence mode="wait">
        {delayedLoading && (
          <motion.div
            key="loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute inset-0 z-100 flex items-center justify-center backdrop-blur-sm transition-colors duration-200",
              isLegacy ? "bg-background/40" : "bg-background/20"
            )}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <div className="size-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin shadow-lg shadow-primary/20" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-foreground/80 animate-pulse tracking-wide uppercase">Loading</span>
                <div className="flex gap-1">
                  <div className="size-1 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
                  <div className="size-1 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
                  <div className="size-1 rounded-full bg-primary/60 animate-bounce" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className={cn(
        "h-full w-full transition-all duration-300",
        delayedLoading && "blur-[2px] grayscale-[0.2]"
      )}>
        {children}
      </div>
    </div>
  );
};
