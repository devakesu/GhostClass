"use client";

import { Navbar } from "@/components/layout/private-navbar";
import { Footer } from "@/components/layout/footer";
import { useInstitutions } from "@/hooks/users/institutions";
import { useEffect, useState, useRef } from "react";
import { Toaster } from "@/components/toaster";
import { LazyMotion, domAnimation, m as motion, useScroll } from "framer-motion";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/error-boundary";
import { ensureCSRFToken } from "@/hooks/use-csrf-token";
import { OutageProvider } from "@/providers/outage-provider";

function ProtectedChrome({ children }: { children: React.ReactNode }) {
  const [isHidden, setIsHidden] = useState(false);
  const { scrollY } = useScroll();
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const isHiddenRef = useRef(false);

  // useInstitutions is also called inside <Navbar>; React Query deduplicates the
  // network request so there is no extra fetch here. We only subscribe to it at
  // the layout level so that React Query starts pre-fetching institutions during
  // the auth-check phase, giving the Navbar data sooner.
  useInstitutions();

  useEffect(() => {
    const unsubscribe = scrollY.on("change", (latest) => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const previous = lastScrollY.current;
          const shouldHide = latest > previous && latest > 150;
          const shouldShow = latest <= previous || latest <= 150;

          if (shouldHide && !isHiddenRef.current) {
            isHiddenRef.current = true;
            setIsHidden(true);
          } else if (shouldShow && isHiddenRef.current) {
            isHiddenRef.current = false;
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
  }, [scrollY]);

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col" suppressHydrationWarning>
        <Toaster />
        <>
          <LazyMotion features={domAnimation}>
            <motion.div
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
              style={{ paddingRight: "var(--scrollbar-width, 0px)" }}
              {...((isHidden &&
                typeof HTMLElement !== "undefined" &&
                HTMLElement?.prototype &&
                "inert" in HTMLElement.prototype
                  ? { inert: true }
                  : {}) as unknown as { inert?: boolean })}
            >
              <Navbar />
            </motion.div>
          </LazyMotion>

          <main className="flex-1 w-full bg-background pt-20">
            <OutageProvider>
              <ErrorBoundary>{children}</ErrorBoundary>
            </OutageProvider>
          </main>

          <Footer />
        </>
      </div>
    </ErrorBoundary>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCsrfReady, setIsCsrfReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureCSRFToken().finally(() => {
      if (!cancelled) setIsCsrfReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isCsrfReady) return null;

  return <ProtectedChrome>{children}</ProtectedChrome>;
}