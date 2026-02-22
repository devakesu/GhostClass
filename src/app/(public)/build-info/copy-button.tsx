"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  /** The text to copy to clipboard */
  text: string;
  /** Button label shown in the default (uncopied) state */
  label: string;
  /** Optional extra className for the button */
  className?: string;
  /** Button size variant */
  size?: "sm" | "default" | "lg" | "icon";
  /** Button variant */
  variant?: "ghost" | "outline" | "default";
}

/**
 * A client-side copy-to-clipboard button.
 * Shows a "Copied" confirmation for 2 seconds after a successful copy.
 */
export function CopyButton({ text, label, className, size = "sm", variant = "ghost" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      window.alert("Copy to clipboard is not supported in this browser or context.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert("Failed to copy to clipboard. Please copy the text manually.");
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleCopy} aria-label={label}>
      {copied ? (
        <>
          <Check className="w-3 h-3 mr-1" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-3 h-3 mr-1" aria-hidden="true" />
          {label}
        </>
      )}
    </Button>
  );
}

interface InlineCopyButtonProps {
  /** The text to copy to clipboard */
  text: string;
}

/**
 * A minimal inline copy icon button for compact spaces (e.g., digest display).
 */
export function InlineCopyButton({ text }: InlineCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      window.alert("Copy to clipboard is not supported in this browser or context.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert("Failed to copy to clipboard. Please copy the text manually.");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 text-neutral-500 hover:text-neutral-300"
      title="Copy digest"
      aria-label="Copy digest"
    >
      {copied ? (
        <Check className="w-3 h-3 inline" aria-hidden="true" />
      ) : (
        <Copy className="w-3 h-3 inline" aria-hidden="true" />
      )}
    </button>
  );
}
