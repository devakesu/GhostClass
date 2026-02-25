"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BUNK_DISCLAIMER, TERMS_VERSION } from "@/app/config/legal";
import { acceptTermsAction } from "@/app/actions/user";
import ReactMarkdown from "react-markdown";
import { Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";

export function AcceptTermsForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleAgree = async () => {
    if (!checked) return;
    setLoading(true);
    try {
      await acceptTermsAction(TERMS_VERSION);
      // Small delay to ensure cookie propagation and cache revalidation complete
      // This helps prevent race conditions with middleware cookie checks
      await new Promise(resolve => setTimeout(resolve, 100));
      // Redirect to dashboard after successful acceptance
      router.push("/dashboard");
    } catch (error) {
      logger.error("Failed to accept terms", error);
      Sentry.captureException(error, {
        tags: { type: "terms_acceptance_failure", location: "AcceptTermsForm/handleAgree" },
        extra: { version: TERMS_VERSION }
      });
      toast.error("Failed to accept terms. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="border border-zinc-800/50 bg-zinc-950/60 backdrop-blur-xl shadow-2xl rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-2">
        <div className="flex flex-row items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
            <Ghost className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Welcome!
            </h1>
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
              Terms of Use v{TERMS_VERSION}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
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
      <div className="p-6 pt-2 flex flex-col gap-4">
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
              rel="noopener noreferrer"
              className="text-white hover:underline hover:text-purple-400 transition-colors"
              onClick={(e) => {
                // Prevent the label from toggling the checkbox when link is clicked
                e.preventDefault();
                e.stopPropagation();
                // Open link securely with noopener and noreferrer
                const link = document.createElement('a');
                link.href = '/legal';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.click();
              }}
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
              ? "bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 shadow-[0_0_30px_-5px_rgba(168,85,247,0.5)]"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-800"
          )}
          aria-live="polite"
        >
          {loading ? "Loading..." : "Enter GhostClass"}
        </Button>
      </div>
    </div>
  );
}
