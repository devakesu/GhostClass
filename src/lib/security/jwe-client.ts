import { CompactEncrypt, compactDecrypt, importJWK } from "jose";
import { logger } from "@/lib/logger";

const JWKS_URL = "/api/.well-known/jwks.json";
const KEY_ALG = "RSA-OAEP-256";
const CONTENT_ENC = "A256GCM";

let cachedPublicKey: any | null = null;
let publicKeyPromise: Promise<any> | null = null;

/**
 * FOR TESTING ONLY: Resets the cached public key and its fetch promise.
 */
export function __resetJweClientCache() {
  cachedPublicKey = null;
  publicKeyPromise = null;
}

/**
 * Fetches the server's public key (JWKS) for encryption.
 */
async function getPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  if (publicKeyPromise) return publicKeyPromise;

  publicKeyPromise = (async () => {
    try {
      const res = await fetch(JWKS_URL);
      if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
      const jwks = await res.json();
      const key = jwks.keys.find((k: any) => k.use === "enc" || k.alg === KEY_ALG);
      if (!key) throw new Error("No suitable encryption key found in JWKS");
      
      cachedPublicKey = await importJWK(key, KEY_ALG);
      return cachedPublicKey;
    } catch (error) {
      logger.error("JWE: Failed to load public key", error);
      publicKeyPromise = null;
      throw error;
    }
  })();

  return publicKeyPromise;
}

/**
 * Encrypts a request payload for the server.
 * Generates a random CEK and includes it in the payload for bi-directional security.
 * 
 * @returns { jwe: string, cek: Uint8Array }
 */
export async function encryptRequest(payload: any): Promise<{ jwe: string; cek: Uint8Array }> {
  const publicKey = await getPublicKey();
  
  // 1. Generate a random 256-bit CEK (Content Encryption Key)
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const cekBase64 = btoa(String.fromCharCode(...cek));

  // 2. Wrap the body and the CEK
  const envelope = {
    payload,
    rcek: cekBase64,
  };

  // 3. Encrypt the envelope using the server's RSA Public Key
  const data = new TextEncoder().encode(JSON.stringify(envelope));
  const jwe = await new CompactEncrypt(data)
    .setProtectedHeader({ alg: KEY_ALG, enc: CONTENT_ENC })
    .encrypt(publicKey);

  return { jwe, cek };
}

/**
 * Encrypts a one-time CEK for header-based exchange (X-JWE-Key).
 * Used for GET requests to request an encrypted response.
 * 
 * @returns { jwe: string, cek: Uint8Array }
 */
export async function encryptHeader(): Promise<{ jwe: string; cek: Uint8Array }> {
  const publicKey = await getPublicKey();
  
  // 1. Generate a random 256-bit CEK
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const cekBase64 = btoa(String.fromCharCode(...cek));

  // 2. Wrap only the CEK
  const envelope = {
    rcek: cekBase64,
  };

  // 3. Encrypt the envelope using the server's RSA Public Key
  const data = new TextEncoder().encode(JSON.stringify(envelope));
  const jwe = await new CompactEncrypt(data)
    .setProtectedHeader({ alg: KEY_ALG, enc: CONTENT_ENC })
    .encrypt(publicKey);

  return { jwe, cek };
}

/**
 * Decrypts a response payload from the server using the provided CEK.
 */
export async function decryptResponse(jwe: string, cek: Uint8Array): Promise<any> {
  try {
    // Import the raw CEK as a CryptoKey for decryption
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      cek as any,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const { plaintext } = await compactDecrypt(jwe, cryptoKey);
    const text = new TextDecoder().decode(plaintext);
    return JSON.parse(text);
  } catch (error) {
    logger.error("JWE: Response decryption failed", error);
    throw new Error("Failed to decrypt secure response");
  }
}
