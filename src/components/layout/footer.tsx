"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { Star, Coffee, ShieldCheck } from "lucide-react";
import Link from "next/link";

const isValidUrl = (urlString: string | undefined): boolean => {
  if (!urlString) return false;
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const Footer = ({ className }: { className?: string }) => {
  const commitSha = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ?? "unknown";
  const shortSha = commitSha === "unknown" ? "dev-build" : commitSha.substring(0, 7);
  
  // Validate all external URLs from environment variables
  const donateUrlRaw = process.env.NEXT_PUBLIC_DONATE_URL;
  const githubUrlRaw = process.env.NEXT_PUBLIC_GITHUB_URL;
  const authorUrlRaw = process.env.NEXT_PUBLIC_AUTHOR_URL;
  const authorName = process.env.NEXT_PUBLIC_AUTHOR_NAME || "Author";
  
  const donateUrl = isValidUrl(donateUrlRaw) ? donateUrlRaw : null;
  const githubUrl = isValidUrl(githubUrlRaw) ? githubUrlRaw : null;
  const authorUrl = isValidUrl(authorUrlRaw) ? authorUrlRaw : null;
  
  // Log validation warnings (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      if (donateUrlRaw && !donateUrl) logger.warn(`[Footer] Invalid Donate URL: ${donateUrlRaw}`);
      if (githubUrlRaw && !githubUrl) logger.warn(`[Footer] Invalid GitHub URL: ${githubUrlRaw}`);
      if (authorUrlRaw && !authorUrl) logger.warn(`[Footer] Invalid Author URL: ${authorUrlRaw}`);
    }
  }, [donateUrlRaw, donateUrl, githubUrlRaw, githubUrl, authorUrlRaw, authorUrl]);

  return (
    <footer className={cn(
      "w-full pt-6 pb-12 md:pb-10 mt-12 border-t border-border/40 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60",
      className
    )} role="contentinfo" aria-label="Site footer">
      <div className="container px-4 md:px-8 flex flex-col-reverse md:flex-row justify-between items-center gap-y-6 gap-x-4 text-sm">
        
        {/* Left Side: Credits, Author & Legal */}
        <div className="flex flex-col items-center md:items-start gap-3">
          <div className="flex items-center gap-2 text-muted-foreground flex-wrap justify-center md:justify-start">
            <span className="opacity-80">By</span>
            <a
              href={authorUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-transparent hover:bg-clip-text hover:bg-linear-to-r hover:from-red-500 hover:to-orange-500 transition-all duration-300"
              aria-label={`Visit ${authorName}'s profile`}
            >
              {authorName}
            </a>
            
            <span className="text-muted-foreground/40 mx-1">·</span>
            
            <div className="flex gap-2">
              <Link 
                target="_blank"
                href="/legal"
                className="hover:text-foreground hover:underline underline-offset-4 transition-all"
              >
                Legal
              </Link>
              <span className="text-muted-foreground/40 mx-1">·</span>
              <Link
                href="/help"
                className="hover:text-foreground hover:underline underline-offset-4 transition-all"
              >
                Help
              </Link>
            </div>

            <span className="text-muted-foreground/40 mx-1">·</span>
            
            <a
              href="https://github.com/ABHAY-100/Bunkr"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              aria-label="View project credits and contributors on GitHub"
            >
              Credits
            </a>
          </div>
        </div>

        {/* Right Side: Actions & System Status */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-4">
          
          {/* Build Indicator */}
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-mono text-muted-foreground hover:bg-primary/10 transition-colors cursor-help"
            title={`Commit: ${commitSha}`}
          >
            <div className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <span>ver</span>
              <a
                href={githubUrl && commitSha !== "unknown" ? `${githubUrl}/commit/${commitSha}` : "#"}
                {...(githubUrl && commitSha !== "unknown"
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="hover:text-primary transition-colors font-semibold"
                aria-label={`View commit ${shortSha} on GitHub`}
              >
                {shortSha}
              </a>
              <span className="opacity-30">/</span>
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href="/build-info"
                className="flex items-center gap-1 hover:text-emerald-500 transition-colors"
                aria-label="View build provenance and security information"
              >
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                <span>verified</span>
              </Link>
            </div>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border/60" />

          {/* Action Buttons with Semantic Links */}
          <div className="flex items-center gap-2">
            {donateUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full bg-background hover:bg-pink-500/10 hover:text-pink-500 hover:border-pink-500/20 transition-all group"
                asChild
              >
                <a href={donateUrl} target="_blank" rel="noopener noreferrer" aria-label="Support the developer by buying them a coffee">
                  <Coffee className="w-3.5 h-3.5 mr-2 text-muted-foreground group-hover:text-pink-500 transition-colors" aria-hidden="true" />
                  <span className="text-xs font-medium">Buy Me a Coffee</span>
                </a>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full bg-background hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/20 transition-all group"
              asChild
            >
              <a href={githubUrl || "#"} target="_blank" rel="noopener noreferrer" aria-label="Star this project on GitHub">
                <Star className="w-3.5 h-3.5 mr-2 text-muted-foreground group-hover:text-yellow-500 transition-colors" aria-hidden="true" />
                <span className="text-xs font-medium">Star</span>
              </a>
            </Button>
          </div>

        </div>
      </div>
    </footer>
  );
};