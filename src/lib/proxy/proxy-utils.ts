import { stripTrailingSlashes } from "@/lib/utils";

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

  const cfUrl = stripTrailingSlashes(process.env.CF_PROXY_URL);
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

  const awsUrl = stripTrailingSlashes(process.env.AWS_SECONDARY_URL);
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

  const directUrl = stripTrailingSlashes(process.env.NEXT_PUBLIC_BACKEND_URL);
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

export function limitReadableStream(
  body: ReadableStream<Uint8Array>,
  limitBytes: number,
  signal?: AbortSignal,
  onLimitExceeded?: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal?.aborted) {
        await reader.cancel();
        controller.error(
          new DOMException("The operation was aborted.", "AbortError"),
        );
        return;
      }

      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        total += value.byteLength;
        if (total > limitBytes) {
          onLimitExceeded?.();
          await reader.cancel();
          controller.error(new UpstreamResponseTooLargeError(limitBytes));
          return;
        }

        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

export function resolveSafeUpstreamErrorMessage(
  body: string,
  status: number,
): string {
  const fallback = status >= 500
    ? "Upstream service error"
    : "Unable to process request";

  if (!body) return fallback;

  const trimmed = body.trim();
  if (
    trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype") ||
    trimmed.toLowerCase().includes("<html")
  ) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error?: string;
    };
    const rawMsg = (parsed.message?.trim() || parsed.error?.trim() || "")
      .trim();
    if (rawMsg) {
      const lower = rawMsg.toLowerCase();
      if (
        lower.includes("/home/") || lower.includes("postgres") ||
        lower.includes("pgsql") || lower.includes("at ") ||
        lower.includes("node_modules")
      ) {
        return fallback;
      }
      return rawMsg.length > 280 ? `${rawMsg.slice(0, 280)}...` : rawMsg;
    }
  } catch {
    // Fall through and sanitize plain text body.
  }

  const sanitized = body.replace(/[\r\n\t]+/g, " ").trim();
  const lowerSanitized = sanitized.toLowerCase();
  if (
    !sanitized || lowerSanitized.includes("/home/") ||
    lowerSanitized.includes("postgres") || lowerSanitized.includes("pgsql") ||
    lowerSanitized.includes("at ") || lowerSanitized.includes("node_modules")
  ) {
    return fallback;
  }

  return sanitized.length > 280 ? `${sanitized.slice(0, 280)}...` : sanitized;
}
