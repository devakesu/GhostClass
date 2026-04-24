"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";

interface ServiceErrorViewProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  showHome?: boolean;
}

export function ServiceErrorView({
  title = "Service Unavailable",
  description = "Please try again in a few moments.",
  onRetry,
  showHome = true,
}: ServiceErrorViewProps) {
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      <div className="mt-2 flex gap-2">
        <Button onClick={onRetry ?? (() => window.location.reload())}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Retry
        </Button>
        {showHome && (
          <Button variant="outline" onClick={() => router.push("/")}>
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>
        )}
      </div>
    </div>
  );
}
