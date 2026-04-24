import { CompactEncrypt, compactDecrypt } from "jose";
import { logger } from "@/lib/logger";
import { getJwePrivateKey } from "@/lib/security/jwks";

const RESPONSE_ENC = "A256GCM";

export async function decryptRequest(jweCompact: string): Promise<unknown> {
  try {
    const privateKey = await getJwePrivateKey();
    const { plaintext } = await compactDecrypt(jweCompact, privateKey);
    const text = new TextDecoder().decode(plaintext);
    return JSON.parse(text) as unknown;
  } catch (error) {
    logger.warn("Failed to decrypt JWE request", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Invalid encrypted request payload");
  }
}

export async function encryptResponse(
  payload: unknown,
  rcekBase64: string,
): Promise<string> {
  const rawKey = Buffer.from(rcekBase64, "base64");
  if (rawKey.length !== 32) {
    throw new Error("Invalid response encryption key length");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encoded = new TextEncoder().encode(JSON.stringify(payload));

  return new CompactEncrypt(encoded)
    .setProtectedHeader({ alg: "dir", enc: RESPONSE_ENC })
    .encrypt(cryptoKey);
}
