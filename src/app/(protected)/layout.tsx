"use client";

import { Navbar } from "@/components/layout/private-navbar";
import { Footer } from "@/components/layout/footer";
import { useInstitutions } from "@/hooks/users/institutions";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "@/components/toaster";
import { LazyMotion, domAnimation, m as motion, useScroll } from "framer-motion";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/error-boundary";
import { createClient } from "@/lib/supabase/client";
import { handleLogout, isAuthSessionMissingError } from "@/lib/security/auth";
import { logger } from "@/lib/logger";
import { useCSRFToken } from "@/hooks/use-csrf-token";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // IMPORTANT — No loading state is tracked here.
  //
  // The server middleware (proxy.ts) already verified the Supabase session
  // and would have redirected to "/" if the user isn't authenticated.
  // By the time this layout renders, auth is guaranteed server-side.
  //
  // The useEffect below still validates the session client-side as
  // defense-in-depth; if the session is invalid it calls handleLogout().
  // On success it is a no-op. On failure it redirects — no loading UI needed.
  const [isHidden, setIsHidden] = useState(false);
  const { scrollY } = useScroll();
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const supabaseRef = useRef(createClient());

  // Initialize CSRF token
  useCSRFToken();

  useEffect(() => {
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
  }, [scrollY, isHidden]);

  // useInstitutions is also called inside <Navbar>; React Query deduplicates the
  // network request so there is no extra fetch here. We only subscribe to it at
  // the layout level so that React Query starts pre-fetching institutions during
  // the auth-check phase, giving the Navbar data sooner. The layout itself does
  // NOT gate on institution loading/error — a failed institution fetch should
  // never make the entire protected area inaccessible.
  useInstitutions();

  useEffect(() => {
    let active = true;

    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabaseRef.current.auth.getUser();
        // Handle auth session missing errors — force full logout to clear cookies/storage
        if (error) {
          if (isAuthSessionMissingError(error)) {
            active = false;
            await handleLogout();
            return;
          }
          throw error;
        }

        // No Supabase user means the session is gone — force full logout so httpOnly
        // cookies (ezygo_access_token, CSRF) and client storage are properly cleared
        if (!user) {
          active = false;
          await handleLogout();
          return;
        }

        // At this point, Supabase has confirmed a valid user session.
        // The EzyGo access token cookie (ezygo_access_token) is HttpOnly and cannot be validated
        // from client-side JavaScript; it's automatically sent with API requests and validated
        // server-side. Any additional validation should occur on the server (e.g., via a server
        // action or API endpoint).
      } catch (err) {
        if (active) {
          // Log the error for debugging, then attempt logout
          logger.error("Auth check failed:", err instanceof Error ? err.message : String(err));
          try {
            await handleLogout();
          } catch (logoutErr) {
            // If logout also fails, force navigation to login page
            logger.error("Logout failed after auth check error:", logoutErr instanceof Error ? logoutErr.message : String(logoutErr));
            router.replace("/");
          }
        }
      }
    };

    checkUser();
    
    return () => { 
      active = false;
    };
  }, [router]); 

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col" suppressHydrationWarning>
        <Toaster />
        {/* Middleware already verified auth server-side; content renders immediately. */}
        {/* Client-side session validation runs in useEffect above as defense-in-depth. */}
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
              // The inert attribute disables keyboard/screen reader interaction with hidden elements
              // Browser support: Chrome 102+, Safari 15.5+, Firefox 112+ (March 2023+)
              // Feature detection ensures graceful degradation on older browsers
              // Only apply inert when the feature is supported and element should be hidden
              {...((isHidden &&
                typeof HTMLElement !== "undefined" &&
                HTMLElement?.prototype &&
                "inert" in HTMLElement.prototype
                  ? { inert: true }
                  : {}) as any)}
            >
              <Navbar />
            </motion.div>
            </LazyMotion>
            
            <main className="flex-1 w-full bg-background pt-20">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
            
            <Footer />
          </>
      </div>
    </ErrorBoundary>
  );
}