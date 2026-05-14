"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { reloadWithUpdate, tryAutoUpdate } from "@/lib/sw-reload";

/**
 * Global Error Handler
 * This is a last-resort error boundary that catches errors in the root layout.
 * Must render its own <html> and <body> tags.
 */
export default function GlobalError({
  error,
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
    // Root layout crashed — the normal error UI never got a chance to show.
    // Silently apply any waiting SW update and reload once (session-guarded
    // against loops). If there is no update waiting, or if this session has
    // already tried once, this is a no-op and the error UI stays visible.
    tryAutoUpdate();
  }, [error]);

  const handleRefresh = () => {
    // Global errors indicate a root-layout crash; re-rendering with reset()
    // won't help if the crash is caused by running stale code after a breaking
    // deploy. Apply any waiting SW update first so the fresh bundle is served.
    reloadWithUpdate();
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
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --ge-bg: linear-gradient(135deg, #f5f5f5 0%, #e5e5e5 100%);
            --ge-text: #171717;
            --ge-card-bg: #ffffff;
            --ge-card-border: #e5e7eb;
            --ge-muted: #6b7280;
            --ge-outline-border: #d1d5db;
            --ge-shadow: rgba(0, 0, 0, 0.1);
            --ge-error-code: #b91c1c;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --ge-bg: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
              --ge-text: #fafafa;
              --ge-card-bg: #18181b;
              --ge-card-border: #27272a;
              --ge-muted: #a1a1aa;
              --ge-outline-border: #3f3f46;
              --ge-shadow: rgba(0, 0, 0, 0.3);
              --ge-error-code: #fca5a5;
            }
          }
          html.dark {
            --ge-bg: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            --ge-text: #fafafa;
            --ge-card-bg: #18181b;
            --ge-card-border: #27272a;
            --ge-muted: #a1a1aa;
            --ge-outline-border: #3f3f46;
            --ge-shadow: rgba(0, 0, 0, 0.3);
            --ge-error-code: #fca5a5;
          }
        ` }} />
      </head>
      <body style={{
        margin: 0,
        padding: '1rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: 'var(--ge-bg)',
        color: 'var(--ge-text)',
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
          background: 'var(--ge-card-bg)',
          borderRadius: '1rem',
          border: '1px solid var(--ge-card-border)',
          boxShadow: '0 20px 25px -5px var(--ge-shadow)',
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

          <p style={{ color: 'var(--ge-muted)', margin: '0 0 2rem', lineHeight: 1.6 }}>
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
                color: 'var(--ge-error-code)',
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
                border: '1px solid var(--ge-outline-border)',
                color: 'var(--ge-text)',
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
