"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function LoadingBlur() {
  const pathname = usePathname();

  useEffect(() => {
    const handleComplete = () => {
      document.body.classList.remove("loading");
    };

    // Listen to route change events
    const observer = new MutationObserver(() => {
      handleComplete();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Cleanup on pathname change
    handleComplete();

    return () => {
      observer.disconnect();
      handleComplete();
    };
  }, [pathname]);

  return null;
}
