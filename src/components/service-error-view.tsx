"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCcw, MessageSquare, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

interface ServiceErrorViewProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  showHome?: boolean;
  error?: unknown;
}

export function ServiceErrorView({
  title = "Connection Error",
  description = "Ezygo API is not responding properly, either it is down or has been modified. Please try again after some time.\n \n If the issue persists even after significant time, please contact us.",
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
    router.push(`/contact?subject=${subject}&message=${message}`);
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
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-xl whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>
      
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onRetry ?? (() => window.location.reload())} className="rounded-full px-6">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Retry
        </Button>
        {showHome && (
          <Button onClick={() => router.push("/")} className="rounded-full bg-blue-500 px-6 hover:bg-blue-600 text-white">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>
        )}
        <Button onClick={handleContactUs} className="rounded-full bg-purple-600 px-6 hover:bg-purple-700 text-white">
          <MessageSquare className="mr-2 h-4 w-4" />
          Contact Us
        </Button>
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={handleLogout} className="text-muted-foreground hover:bg-transparent hover:text-foreground">
          <LogOut className="mr-2 h-4 w-4" />
          Logout & try again
        </Button>
      </div>
    </div>
  );
}
