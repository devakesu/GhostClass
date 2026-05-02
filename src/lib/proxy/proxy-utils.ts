// proxy-utils.ts

export interface EgressTarget {
  readonly baseUrl: string;
  readonly proxyHeaders: Record<string, string>;
  readonly secret?: string;
  readonly name: string;
  readonly timeoutMs: number;
}

export class UpstreamResponseTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`Upstream response exceeded ${limitBytes} bytes`);
    this.name = "UpstreamResponseTooLargeError";
  }
}

export function buildEgressTargets(): EgressTarget[] {
  const targets: EgressTarget[] = [];

  const cfUrl = process.env.CF_PROXY_URL?.trim().replace(/\/+$/, "");
  if (cfUrl) {
    const secret = process.env.CF_PROXY_SECRET?.trim();
    targets.push({
      baseUrl: cfUrl,
      proxyHeaders: secret ? { "x-proxy-secret": secret } : {},
      secret,
      name: "primary",
      timeoutMs: 10_000,
    });
  }

  const awsUrl = process.env.AWS_SECONDARY_URL?.trim().replace(/\/+$/, "");
  if (awsUrl) {
    const secret = process.env.AWS_SECONDARY_SECRET?.trim();
    targets.push({
      baseUrl: awsUrl,
      proxyHeaders: secret ? { "x-proxy-secret": secret } : {},
      secret,
      name: "secondary",
      timeoutMs: 10_000,
    });
  }

  const directUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "");
  if (directUrl) {
    targets.push({
      baseUrl: directUrl,
      proxyHeaders: {},
      secret: undefined,
      name: "direct",
      timeoutMs: 10_000,
    });
  }

  return targets;
}

export async function readWithLimit(
  body: ReadableStream<Uint8Array> | null,
  limitBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new UpstreamResponseTooLargeError(limitBytes);
    }

    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

export function resolveSafeUpstreamErrorMessage(
  body: string,
  status: number,
): string {
  const fallback = status >= 500
    ? "Upstream service error"
    : "Unable to process request";

  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error?: string;
    };
    if (parsed.message?.trim()) return parsed.message.trim();
    if (parsed.error?.trim()) return parsed.error.trim();
  } catch {
    // Fall through and sanitize plain text body.
  }

  const sanitized = body.replace(/[\r\n\t]+/g, " ").trim();
  if (!sanitized) return fallback;

  return sanitized.length > 280 ? `${sanitized.slice(0, 280)}...` : sanitized;
}
