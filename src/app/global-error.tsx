"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

/**
 * Global Error Handler
 * This is a last-resort error boundary that catches errors in the root layout.
 * Must render its own <html> and <body> tags.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        location: "global-error.tsx",
        digest: error.digest,
      },
    });
  }, [error]);

  const handleRefresh = () => {
    try {
      reset();
    } catch {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error - GhostClass</title>
      </head>
      <body style={{
        margin: 0,
        padding: '1rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        color: '#fafafa',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <div style={{
          maxWidth: '600px',
          width: '100%',
          textAlign: 'center',
          padding: '2.5rem',
          background: '#18181b',
          borderRadius: '1rem',
          border: '1px solid #27272a',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          boxSizing: 'border-box',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderRadius: '50%',
            marginBottom: '1.5rem',
          }}>
            <AlertTriangle style={{ width: '40px', height: '40px', color: '#ef4444' }} />
          </div>

          <h1 style={{
            margin: '0 0 0.75rem',
            fontSize: '2rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Critical Error
          </h1>

          <p style={{ color: '#a1a1aa', margin: '0 0 2rem', lineHeight: 1.6 }}>
            We encountered a critical error. This has been automatically reported to our team.
            You can try refreshing the page or return to the homepage.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <details style={{
              textAlign: 'left',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <summary style={{
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem',
                color: '#ef4444',
                marginBottom: '0.5rem',
              }}>
                Error Details (Dev Only)
              </summary>
              <pre style={{
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: '#fca5a5',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </details>
          )}

          <div style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginTop: '2rem',
            justifyContent: 'center',
          }}>
            <button
              onClick={handleRefresh}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 500,
                borderRadius: '0.5rem',
                cursor: 'pointer',
                border: 'none',
                minWidth: '140px',
                background: '#a855f7',
                color: 'white',
              }}
            >
              <RefreshCcw style={{ width: '18px', height: '18px' }} />
              Try Again
            </button>

            <button
              onClick={handleGoHome}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 500,
                borderRadius: '0.5rem',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid #3f3f46',
                color: '#fafafa',
                minWidth: '140px',
              }}
            >
              <Home style={{ width: '18px', height: '18px' }} />
              Go Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
