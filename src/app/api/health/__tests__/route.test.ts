/**
 * Tests for Health API Route
 */

import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("Health API Route", () => {
  it("should return ok status", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.status).toBe("ok");
  });

  it("should return timestamp in ISO format", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should return valid JSON", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("timestamp");
  });

  it("should not expose version in public response", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).not.toHaveProperty("version");
  });

  it("should have correct structure", async () => {
    const response = await GET();
    const data = await response.json();

    expect(typeof data.status).toBe("string");
    expect(typeof data.timestamp).toBe("string");
  });

  it("should return 200 status code", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });
});
