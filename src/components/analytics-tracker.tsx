"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getOrCreateClientId } from "@/lib/analytics";

/**
 * Client component for automatic event tracking via server-side API
 * Replaces gtag.js enhanced measurement to avoid CSP violations
 * 
 * Automatically tracks (matching gtag.js enhanced measurement):
 * - Page views (route changes)
 * - Scroll depth (25%, 50%, 75%, 90%)
 * - Outbound link clicks
 * - File downloads
 * - Form interactions (focus, submit, abandon)
 * - Video engagement (play, pause, complete)
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollTracked = useRef<Set<number>>(new Set());
  const formInteractions = useRef<Map<HTMLFormElement, { focused: boolean; submitted: boolean }>>(new Map());

  useEffect(() => {
    // Track page view on mount and route changes
    const trackPageView = async () => {
      try {
        const clientId = getOrCreateClientId();
        const url = `${window.location.origin}${pathname}${searchParams?.toString() ? `?${searchParams}` : ""}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        try {
          await fetch("/api/analytics/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId,
              events: [
                {
                  name: "page_view",
                  params: {
                    page_location: url,
                    page_title: document.title,
                    page_referrer: (() => {
                      if (!document.referrer) return "";
                      try {
                        const ref = new URL(document.referrer);
                        return ref.origin + ref.pathname;
                      } catch {
                        return "";
                      }
                    })(),
                  },
                },
              ],
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Reset scroll tracking on page change
        scrollTracked.current.clear();
        // Reset form tracking on page change
        formInteractions.current.clear();
      } catch (error) {
        // Silently fail - don't break app if analytics fails
        // Note: Using console.warn instead of logger utility as this is a client component
        // and the logger utility is primarily designed for server-side use
        console.warn("[Analytics] Failed to track page view:", error);
      }
    };

    trackPageView();
  }, [pathname, searchParams]);

  useEffect(() => {
    // Enhanced measurement: Scroll depth tracking with throttling
    let scrollTicking = false;

    const handleScroll = () => {
      if (scrollTicking) {
        return;
      }

      scrollTicking = true;

      window.requestAnimationFrame(() => {
        scrollTicking = false;

        const maxScrollable = document.documentElement.scrollHeight - window.innerHeight;
        
        // If there is no scrollable content, skip scroll depth tracking
        if (maxScrollable <= 0) {
          return;
        }

        const scrollPercent = Math.round((window.scrollY / maxScrollable) * 100);

        const thresholds = [25, 50, 75, 90];
        for (const threshold of thresholds) {
          if (scrollPercent >= threshold && !scrollTracked.current.has(threshold)) {
            scrollTracked.current.add(threshold);
            trackEvent("scroll", { percent_scrolled: threshold });
            break; // Only track one threshold per scroll event
          }
        }
      });
    };

    // Enhanced measurement: Outbound link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      
      if (link && link.href) {
        let url: URL;
        try {
          url = new URL(link.href, window.location.href);
        } catch (error) {
          // Malformed URL - skip tracking for this click to avoid breaking analytics
          // Note: Using console.warn instead of logger utility as this is a client component
          // and the logger utility is primarily designed for server-side use
          console.warn("[Analytics] Ignoring click with invalid URL:", link.href, error);
          return;
        }
        
        const isOutbound = url.hostname !== window.location.hostname;
        const isDownload = link.hasAttribute("download") || 
                          /\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(url.pathname);

        if (isOutbound) {
          trackEvent("click", {
            link_domain: url.hostname,
            link_url: url.href,
            outbound: true,
          });
        } else if (isDownload) {
          trackEvent("file_download", {
            file_name: url.pathname.split("/").pop() ?? "unknown",
            file_extension: url.pathname.split(".").pop() ?? "unknown",
            link_url: url.href,
          });
        }
      }
    };

    // Enhanced measurement: Form interactions (matching gtag.js)
    const handleFormInteraction = (e: Event) => {
      const form = (e.target as HTMLElement).closest("form");
      if (!form) return;

      const formData = formInteractions.current.get(form) || { focused: false, submitted: false };
      
      // Use getAttribute to avoid HTMLFormElement named-element getter returning a
      // child <input name="name"> / <input name="action"> instead of the string attribute.
      const formId = form.getAttribute("id") || "unknown";
      const formName = form.getAttribute("name") || formId;
      const formAction = form.getAttribute("action") || window.location.href;

      if (e.type === "focusin" && !formData.focused) {
        // First interaction with form
        formData.focused = true;
        formInteractions.current.set(form, formData);
        trackEvent("form_start", {
          form_id: formId,
          form_name: formName,
          form_destination: formAction,
        });
      } else if (e.type === "submit") {
        // Form submitted
        formData.submitted = true;
        formInteractions.current.set(form, formData);
        trackEvent("form_submit", {
          form_id: formId,
          form_name: formName,
          form_destination: formAction,
        });
      }
    };

    // Enhanced measurement: Video engagement (matching gtag.js)
    const handleVideoEvent = (e: Event) => {
      const video = e.target as HTMLVideoElement;
      if (!video || video.tagName !== "VIDEO") return;

      // Validate video duration to prevent NaN or Infinity
      const hasValidDuration = Number.isFinite(video.duration) && video.duration > 0;
      const videoDuration = hasValidDuration ? Math.round(video.duration) : 0;
      const videoPercent = hasValidDuration
        ? Math.round((video.currentTime / video.duration) * 100)
        : 0;

      const videoData = {
        video_title: video.title || (video.currentSrc?.split("/").pop() ?? "unknown"),
        video_url: video.currentSrc,
        video_duration: videoDuration,
        video_current_time: Math.round(video.currentTime),
        video_percent: videoPercent,
      };

      switch (e.type) {
        case "play":
          trackEvent("video_start", videoData);
          break;
        case "pause":
          if (hasValidDuration && video.currentTime < video.duration) {
            trackEvent("video_progress", videoData);
          }
          break;
        case "ended":
          trackEvent("video_complete", videoData);
          break;
      }
    };

    // Add event listeners
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("click", handleClick, true);
    
    // Form tracking
    document.addEventListener("focusin", handleFormInteraction, true);
    document.addEventListener("submit", handleFormInteraction, true);
    
    // Video tracking
    document.addEventListener("play", handleVideoEvent, true);
    document.addEventListener("pause", handleVideoEvent, true);
    document.addEventListener("ended", handleVideoEvent, true);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("focusin", handleFormInteraction, true);
      document.removeEventListener("submit", handleFormInteraction, true);
      document.removeEventListener("play", handleVideoEvent, true);
      document.removeEventListener("pause", handleVideoEvent, true);
      document.removeEventListener("ended", handleVideoEvent, true);
    };
  }, []);

  return null; // This component doesn't render anything
}

/**
 * Track custom events
 * Usage: trackEvent('button_click', { button_name: 'signup' })
 */
export async function trackEvent(
  eventName: string,
  eventParams?: Record<string, any>
) {
  try {
    const clientId = getOrCreateClientId();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    // Guard against circular references (e.g. DOM nodes accidentally passed as params)
    const seen = new WeakSet();
    const safeReplacer = (_key: string, value: unknown) => {
      if (value instanceof Node) return undefined;
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    };

    try {
      await fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          { clientId, events: [{ name: eventName, params: eventParams }] },
          safeReplacer,
        ),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Note: Using console.warn instead of logger utility as this is a client component
    // and the logger utility is primarily designed for server-side use
    console.warn("[Analytics] Failed to track event:", error);
  }
}
