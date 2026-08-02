// Example: Tracking custom events with server-side GA4
// All basic events (page views, scroll, links, forms, videos) are tracked automatically
import { trackEvent } from "@/components/analytics-tracker";

// Track button clicks
export const handleSignupClick = async () => {
  await trackEvent("signup_click", {
    button_location: "navbar",
    button_text: "Sign Up",
  });
};

// Track feature usage
export const handleFeatureUse = async (featureName: string) => {
  await trackEvent("feature_used", {
    feature_name: featureName,
    timestamp: new Date().toISOString(),
  });
};

// Track e-commerce events
// Note: Event parameters must be strings, numbers, or booleans. Arrays/objects are not sent.
export const handlePurchase = async (
  orderData: { id: string; total: number },
) => {
  await trackEvent("purchase", {
    transaction_id: orderData.id,
    value: orderData.total,
    currency: "USD",
  });
};

// Track errors
export const handleError = async (error: Error) => {
  await trackEvent("error_occurred", {
    error_message: error.message,
    error_type: error.name,
    page_url: window.location.href,
  });
};

// AUTOMATIC TRACKING (no code needed):
// ✅ Page views - tracked on route changes
// ✅ Scroll depth - tracked at 25%, 50%, 75%, 90%
// ✅ Outbound links - tracked on external domain clicks
// ✅ File downloads - tracked for .pdf, .zip, .doc, etc.
// ✅ Form interactions - tracked on form start and submit
// ✅ Video engagement - tracked on play, pause, complete
