"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Test page to trigger ErrorBoundary
 * Navigate to /test-error to test error handling
 * DELETE THIS FILE IN PRODUCTION
 */
export default function TestErrorPage() {
  const [throwError, setThrowError] = useState(false);

  if (throwError) {
    throw new Error("This is a test error thrown intentionally to test ErrorBoundary!");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Error Boundary Test</h1>
        <p className="text-muted-foreground">Click the button to trigger an error</p>
        <Button onClick={() => setThrowError(true)} variant="destructive">
          Throw Test Error
        </Button>
      </div>
    </div>
  );
}
