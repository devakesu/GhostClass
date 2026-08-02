"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Ghost, Home } from "lucide-react";

export function NotFoundContent() {
  const router = useRouter();

  return (
    <div className="max-w-2xl w-full text-center space-y-8">
      {/* Ghost Icon with Animation */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-purple-500/20 rounded-full animate-pulse" />
          <Ghost
            className="w-32 h-32 text-purple-500/80 relative animate-bounce"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Error Code */}
      <div className="space-y-2">
        <h1 className="text-8xl md:text-9xl font-black tracking-tighter bg-linear-to-r from-purple-500 via-pink-500 to-red-500 bg-clip-text text-transparent">
          404
        </h1>
        <p className="text-2xl md:text-3xl font-bold text-foreground">
          Page Not Found
        </p>
      </div>

      {/* Description */}
      <div className="space-y-3 max-w-md mx-auto">
        <p className="text-muted-foreground text-lg">
          Looks like this page went ghost mode. 👻
        </p>
        <p className="text-sm text-muted-foreground/80">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
        <Button
          onClick={() => router.push("/")}
          size="lg"
          className="gap-2 min-w-50"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Go Home
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="gap-2 min-w-50"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Go Back
        </Button>
      </div>
    </div>
  );
}
