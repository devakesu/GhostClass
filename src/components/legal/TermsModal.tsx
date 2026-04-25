"use client";

import { useEffect, useState, useRef } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BUNK_DISCLAIMER, TERMS_VERSION } from "@/app/config/legal";
import { acceptTermsAction } from "@/app/actions/user";
import ReactMarkdown from "react-markdown";
import { Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/hooks/users/profile";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export default function TermsModal() {
  const pathname = usePathname();
  const { data: profile } = useProfile();
  
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hasCheckedStatus, setHasCheckedStatus] = useState(false);
  
  // Prevent duplicate checks in Strict Mode
  const checkAttempted = useRef(false);

  useEffect(() => {
    if (checkAttempted.current) return;
    
    // 1. Blacklist Paths
    if (pathname === "/legal" || pathname === "/" || pathname === "/contact") {
        setOpen(false);
        setHasCheckedStatus(true);
        return;
    }

    // 2. Check Cookie
    const cookieTerms = document.cookie
      .split("; ")
      .find((row) => row.startsWith("terms_version="))
      ?.split("=")[1];

    if (cookieTerms === TERMS_VERSION) {
        setHasCheckedStatus(true);
        return;
    }

    // 3. Check DB (if profile loaded)
    if (profile) {
        checkAttempted.current = true;
        if (profile.terms_version === TERMS_VERSION) {
            // Sync cookie if missing
            const isSecureContext =
              typeof window !== "undefined" && window.location.protocol === "https:";
            document.cookie = `terms_version=${TERMS_VERSION}; path=/; max-age=31536000; SameSite=Lax${isSecureContext ? "; Secure" : ""}`;
            setHasCheckedStatus(true);
            return; // Already agreed (DB)
        }
        // If we have profile but mismatch, show modal
        setOpen(true);
        setHasCheckedStatus(true);
    }
  }, [pathname, profile]);

  // Don't render until we've decided visibility
  if (!hasCheckedStatus || !open) return null;

  const handleAgree = async () => {
    if (!checked) return;
    setLoading(true);
    try {
      await acceptTermsAction(TERMS_VERSION);
      // Set cookie immediately for instant feedback on reload
      const isSecureContext =
        typeof window !== "undefined" && window.location.protocol === "https:";
      document.cookie = `terms_version=${TERMS_VERSION}; path=/; max-age=31536000; SameSite=Lax${isSecureContext ? "; Secure" : ""}`;
      setOpen(false);
    } catch (error) {
      logger.error("Failed to accept terms", error);
      Sentry.captureException(error, {
          tags: { type: "terms_acceptance_failure", location: "TermsModal/handleAgree" },
          extra: { version: TERMS_VERSION }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
      <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[480px] border-zinc-800 bg-zinc-950/90 backdrop-blur-xl shadow-lg p-0 gap-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="p-6 pb-2">
          <DialogHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
              <Ghost className="h-5 w-5 text-purple-400" />
            </div>
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                Welcome!
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                Terms of Use v{TERMS_VERSION}
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-2">
          <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="prose prose-sm prose-invert max-w-none text-zinc-300">
              <ReactMarkdown 
                components={{
                  h1: ({node: _node, ...props}) => <h1 className="text-sm font-bold text-white uppercase tracking-wider mb-2 mt-4" {...props} />,
                  p: ({node: _node, ...props}) => <p className="text-xs leading-relaxed text-zinc-400 mb-1.5" {...props} />,
                  ul: ({node: _node, ...props}) => <ul className="list-disc pl-4 mb-3 space-y-1" {...props} />,
                  li: ({node: _node, ...props}) => <li className="text-xs text-zinc-400 pl-1" {...props} />,
                  strong: ({node: _node, ...props}) => <strong className="text-purple-300 font-semibold" {...props} />
                }}
              >
                {BUNK_DISCLAIMER}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-6 pt-2 flex-col gap-4 sm:flex-col sm:justify-center sm:space-x-0">
          
          <label className="flex items-center space-x-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:bg-zinc-900/80 transition-colors cursor-pointer">
            <Checkbox 
              id="terms" 
              checked={checked} 
              onCheckedChange={(c) => setChecked(!!c)}
              aria-labelledby="terms-label"
              className="border-zinc-600 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            />

            <span id="terms-label" className="text-xs text-zinc-400 font-normal select-none">
              I have read and accept the{" "}
              <Link 
                href="/legal" 
                target="_blank" 
                className="text-white hover:underline hover:text-purple-400 transition-colors"
                onClick={(e) => e.stopPropagation()} 
              >
                above Disclaimer and all Policies listed here
              </Link>.
            </span>
          </label>

          <Button 
            onClick={handleAgree} 
            disabled={loading || !checked}
            className={cn(
              "w-full h-11 font-semibold transition-all duration-300",
              checked 
                ? "bg-white text-black hover:bg-zinc-200 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]" 
                : "bg-zinc-800 text-zinc-500 hover:bg-zinc-800"
            )}
            aria-live="polite"
          >
            {loading ? "Loading..." : "Enter GhostClass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}