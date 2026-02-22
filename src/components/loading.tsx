"use client";

import { Ring2 } from "ldrs/react";
import "ldrs/react/Ring2.css";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, RefreshCw } from "lucide-react";
import { handleLogout } from "@/lib/security/auth";

/**
 * Loading screen component with timeout warning and logout option.
 * Displays when waiting for external services (e.g., Ezygo authentication).
 * Shows a warning message after 15 seconds with option to logout.
 * 
 * Features:
 * - Animated spinner with accessible labels
 * - Timeout warning after 15 seconds
 * - Logout button for stuck states
 * - Humorous loading message
 * 
 * @param minimal - When true, hides the timeout warning and action buttons.
 *                  Use this when Loading is embedded inside a component (e.g. a chart)
 *                  rather than as a full-page loader.
 *
 * @example
 * ```tsx
 * <Loading />           // full-page with logout/refresh buttons after 15s
 * <Loading minimal />   // spinner + message only, no buttons
 * ```
 */
export function Loading({ minimal = false }: { minimal?: boolean }) {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWarning(true);
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  const handleLogoutClick = async () => {
    await handleLogout();
  };

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen w-full gap-8 p-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading application, please wait...</span>
      {/* Spinner + Text Container */}
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <Ring2 size="45" stroke="4" speed="1" color="#3b82f6" aria-hidden="true" />
        
        <div className="space-y-2">
          <p className="text-lg font-medium text-muted-foreground italic leading-relaxed">
            &quot;Waiting on Ezygo to stop ghosting us 👻&quot;
          </p>
        </div>
      </div>

      {showWarning && !minimal && (
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          {/* Text Group with gap */}
          <div className="flex flex-col gap-20">
            <div className="text-center text-sm text-muted-foreground/80">
              The site will not load if EzyGo is down. EzyGo response time is slow, sorry for the wait!
            </div>
            <div className="text-center text-sm text-muted-foreground/80">
              Taking too long ({">"} 1 min)?
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-2"
            aria-label="Refresh the page"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Page
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogoutClick}
            className="gap-2"
            aria-label="Sign out and return to login page"
          >
            <LogOut className="h-4 w-4" />
            Logout & Try Again
          </Button>
        </div>
      )}
    </div>
  );
}