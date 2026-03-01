"use client";

import { AlertTriangle, Mail, RefreshCcw, Home, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAppDomain } from "@/lib/utils";
import { handleLogout, isAuthSessionMissingError } from "@/lib/security/auth";
import { reloadWithUpdate } from "@/lib/sw-reload";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

interface ErrorFallbackProps {
  error: Error;
  reset?: () => void;
  showDetails?: boolean;
  homeUrl?: string;
}

/**
 * ErrorFallback component that displays a user-friendly error message
 * with options to try again or go back to the dashboard.
 */
export function ErrorFallback({ error, reset, showDetails, homeUrl = "/dashboard" }: ErrorFallbackProps) {
  const router = useRouter();
  const isDevelopment = process.env.NODE_ENV === "development";
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional for hydration fix
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          // Only log unexpected auth errors, not normal logged-out states
          if (!isAuthSessionMissingError(authError)) {
            logger.error("Auth check failed:", authError);
          }
          setIsLoggedIn(false);
          return;
        }

        setIsLoggedIn(!!user);
      } catch (error) {
        // Only log unexpected errors, not normal logged-out states
        if (!isAuthSessionMissingError(error)) {
          logger.error("Auth check failed:", error);
        }
        setIsLoggedIn(false);
      }
    };
    checkAuth();
  }, []);

  const handleGoHome = () => {
    router.push(homeUrl);
  };

  const handleTryAgain = () => {
    if (reset) {
      reset();
    } else {
      // No reset callback — fall back to a full reload. Apply any waiting SW
      // update first so a breaking deploy doesn't reload into stale code.
      reloadWithUpdate();
    }
  };

  const handleLogoutClick = async () => {
    setIsLoggingOut(true);
    try {
      await handleLogout();
    } catch (error) {
      // handleLogout already handles errors, but just in case
      logger.error("Logout error:", error);
      window.location.href = "/";
    }
  };

  const handleEmailReport = () => {
    const appDomain = getAppDomain();
    
    const subject = encodeURIComponent('Error Report - GhostClass');
    const body = encodeURIComponent(
      `Hi Admin,\n\nI encountered an error while using GhostClass.\n\n` +
      `Timestamp: ${new Date().toISOString()}\n\n` +
      `Note: Detailed error information has been automatically logged to our monitoring system.\n\n` +
      `Please help resolve this issue.\n\nThank you!`
    );

    window.location.href = `mailto:admin@${appDomain}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="flex min-h-100 w-full items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center space-y-6 animate-in fade-in zoom-in duration-300">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/20">
            <AlertTriangle className="h-12 w-12 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="text-lg text-muted-foreground">
            We encountered an unexpected error
          </p>
        </div>

        {/* Error Details (Development Only) */}
        {(isDevelopment || showDetails) && (
          <div className="mx-auto max-w-lg">
            <details className="text-left bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-4">
              <summary className="cursor-pointer font-medium text-sm text-red-600 dark:text-red-400">
                Error Details (Dev Only)
              </summary>
              <pre className="mt-2 text-xs font-mono text-red-700 dark:text-red-300 overflow-x-auto">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </details>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-4">
          <Button
            onClick={handleTryAgain}
            size="lg"
            className="gap-2 min-w-45"
          >
            <RefreshCcw className="w-4 h-4" aria-hidden="true" />
            Try Again
          </Button>
          
          <Button
            onClick={handleGoHome}
            size="lg"
            variant="outline"
            className="gap-2 min-w-45"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            Go Home
          </Button>

          <Button
            onClick={handleEmailReport}
            size="lg"
            variant="outline"
            className="gap-2 min-w-45"
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            Report Error
          </Button>

          {isMounted && isLoggedIn && (
            <Button
              onClick={handleLogoutClick}
              size="lg"
              variant="destructive"
              disabled={isLoggingOut}
              className="gap-2 min-w-45"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              {isLoggingOut ? "Logging out..." : "Logout"}
            </Button>
          )}
        </div>

        {/* Help Text */}
        <p className="text-sm text-muted-foreground pt-4">
          If the problem persists, please report the error or contact support.
        </p>
      </div>
    </div>
  );
}
