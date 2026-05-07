/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSignupClick, handleFeatureUse, handlePurchase, handleError } from '../analytics-usage.example';
import { trackEvent } from "@/components/analytics-tracker";

vi.mock("@/components/analytics-tracker", () => ({
  trackEvent: vi.fn(),
}));

describe('analytics-usage.example', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('covers handleSignupClick', async () => {
    await handleSignupClick();
    expect(trackEvent).toHaveBeenCalledWith("signup_click", {
      button_location: "navbar",
      button_text: "Sign Up",
    });
  });

  it('covers handleFeatureUse', async () => {
    const featureName = "test-feature";
    await handleFeatureUse(featureName);
    expect(trackEvent).toHaveBeenCalledWith("feature_used", expect.objectContaining({
      feature_name: featureName,
    }));
  });

  it('covers handlePurchase', async () => {
    const orderData = { id: "ord-123", total: 99.99 };
    await handlePurchase(orderData);
    expect(trackEvent).toHaveBeenCalledWith("purchase", {
      transaction_id: orderData.id,
      value: orderData.total,
      currency: "USD",
    });
  });

  it('covers handleError', async () => {
    const error = new Error("Test error");
    // Mock window.location.href
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { href: "http://localhost/test" } as any;

    await handleError(error);
    expect(trackEvent).toHaveBeenCalledWith("error_occurred", {
      error_message: error.message,
      error_type: "Error",
      page_url: "http://localhost/test",
    });

    window.location = originalLocation;
  });
});
