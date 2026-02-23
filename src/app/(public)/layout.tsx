"use client";

import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/toaster";
import { useState, useRef, useEffect } from "react";
import { motion, useScroll } from "framer-motion";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isHidden, setIsHidden] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { scrollY } = useScroll();
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional for hydration fix
    setIsMounted(true);
  }, []);
  
  useEffect(() => {
    if (!isMounted) return;
    
    const unsubscribe = scrollY.on("change", (latest) => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const previous = lastScrollY.current;
          
          const shouldHide = latest > previous && latest > 150;
          const shouldShow = latest <= previous || latest <= 150;
          
          if (shouldHide && !isHidden) {
            setIsHidden(true);
          } else if (shouldShow && isHidden) {
            setIsHidden(false);
          }
          
          lastScrollY.current = latest;
          ticking.current = false;
        });
        
        ticking.current = true;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [scrollY, isHidden, isMounted]);
  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col">

        <motion.div
          suppressHydrationWarning
          variants={{
            visible: { y: 0 },
            hidden: { y: "-100%" },
          }}
          animate={isHidden ? "hidden" : "visible"}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className={cn(
            "fixed top-0 left-0 right-0 z-50",
            isHidden ? "pointer-events-none" : "pointer-events-auto"
          )}
          // Accessibility: use only `inert` to hide the navbar from AT and remove it from
          // the tab order when scrolled away. Do NOT combine with aria-hidden — the spec
          // (and browsers) warn when aria-hidden is set on an ancestor of a focused element,
          // which can occur during the scroll animation. `inert` handles both AT hiding AND
          // focus removal atomically, making aria-hidden redundant here.
          // Browser support: Chrome 102+, Safari 15.5+, Firefox 112+ (March 2023+)
          // Graceful degradation: on older browsers the navbar is visually off-screen via
          // the CSS transform but remains keyboard-reachable (acceptable fallback).
          {...((isHidden &&
            typeof HTMLElement !== "undefined" &&
            HTMLElement?.prototype &&
            "inert" in HTMLElement.prototype
              ? { inert: true }
              : {}) as any)}
        >
          <PublicNavbar />
        </motion.div>

        <main className="flex-1 w-full pt-20">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
        
        <Footer />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}