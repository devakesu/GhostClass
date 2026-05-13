"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCcw, MessageSquare, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

interface ServiceErrorViewProps {
  title?: string;
  messages?: string[];
  description?: string;
  onRetry?: () => void;
  showHome?: boolean;
  error?: unknown;
}

import { motion } from "framer-motion";

export function ServiceErrorView({
  title = "Service Unavailable",
  messages = ["EzyGo servers are currently down. Please try again later."],
  description,
  onRetry,
  showHome = true,
  error,
}: ServiceErrorViewProps) {
  const router = useRouter();

  const handleContactUs = () => {
    const errorStr = error ? String(error) : "Unknown Error";
    const sanitizedError = errorStr.length > 300 ? `${errorStr.substring(0, 300)}...` : errorStr;
    const subject = encodeURIComponent("Connection Error");
    const message = encodeURIComponent(`I am experiencing a connection error with the Ezygo API.\n\nContext: ${sanitizedError}`);
    window.location.href = `mailto:support@ghostclass.app?subject=${subject}&message=${message}`;
  };

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in duration-500">
      {/* Background Decorative Blobs (Premium feel) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-red-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        {/* Error Icon with Pulsed Glow */}
        <div className="relative mb-8">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full bg-red-500/20 blur-2xl"
          />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-500/10 text-red-500 shadow-2xl shadow-red-500/20">
            <AlertTriangle className="h-12 w-12" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-3xl font-black tracking-tight text-foreground sm:text-4xl font-manrope">
          {title}
        </h1>

        {/* Messages */}
        <div className="mb-10 space-y-3">
          {(messages || []).map((msg, i) => (
            <p key={i} className="text-lg font-medium text-muted-foreground/80 leading-relaxed max-w-md mx-auto">
              {msg}
            </p>
          ))}
          {description && (
            <p className="text-sm text-muted-foreground/60 max-w-sm mx-auto">
              {description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-6 sm:flex-row sm:justify-center mt-4 mb-8">
          <Button 
            onClick={onRetry ?? (() => window.location.reload())} 
            className="h-16 w-full sm:w-80 rounded-2xl bg-primary px-10 text-lg font-extrabold text-primary-foreground hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95"
          >
            <RefreshCcw className="mr-3 h-6 w-6" />
            Try Again
          </Button>

          {showHome && (
            <Button 
              variant="outline"
              onClick={() => router.push("/")} 
              className="h-14 rounded-2xl border-white/10 bg-white/5 px-10 text-base font-bold text-foreground hover:bg-white/10 transition-all"
            >
              <Home className="mr-2 h-5 w-5" />
              Home
            </Button>
          )}
        </div>

        {/* Tertiary Actions */}
        <div className="mt-12 flex flex-wrap justify-center gap-6">
          <button 
            onClick={handleContactUs} 
            className="flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Contact Support
          </button>
          
          <button 
            onClick={handleLogout} 
            className="flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </button>
        </div>

        {/* Technical Details (Expandable) */}
        {error !== undefined && error !== null && (
          <div className="mt-12 w-full max-w-md overflow-hidden rounded-2xl border border-white/5 bg-white/2">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-center p-4 text-xs font-bold text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors uppercase tracking-widest">
                Technical Details
              </summary>
              <div className="border-t border-white/5 p-4 text-left">
                <pre className="overflow-x-auto font-dm-mono text-[10px] text-muted-foreground/50 leading-relaxed whitespace-pre-wrap break-all">
                  {error ? String(error) : "No details available"}
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
